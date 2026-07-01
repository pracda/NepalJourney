# Booking Flow — Technical Reference

How a tourist finds a guide, creates a booking, and both parties track the trip through to completion.

---

## 1. State Machine

```
                  ┌─────────┐
         create   │         │  guide accepts
  ───────────────▶│ pending │──────────────────▶ confirmed
                  │         │
                  └────┬────┘
                       │ guide declines OR tourist cancels
                       ▼
                   cancelled ◀──────────────────────────────┐
                                                            │ tourist cancels
                  ┌───────────┐                             │
                  │           │◀── guide accepts            │
                  │ confirmed │                             │
                  │           │──────────────────────────────┘
                  └─────┬─────┘
                        │ guide starts trip
                        ▼
                  ┌────────────┐
                  │            │──── guide marks done ──▶ completed (terminal)
                  │ in_progress│
                  │            │──── either party ──────▶ disputed
                  └────────────┘
                                                          (NTB resolves via admin API)
```

### Transition rules by actor

| Current status | Guide can → | Tourist can → |
|---|---|---|
| pending | confirmed, cancelled | cancelled |
| confirmed | in_progress, cancelled | cancelled |
| in_progress | completed, disputed | disputed |
| completed | — | — |
| cancelled | — | — |
| disputed | — | — |

Invalid transitions return `422 Unprocessable Entity` with a human-readable explanation. The database also has a `CHECK` constraint on `status` preventing completely unknown values.

---

## 2. Commission Model

```
total_amount_usd     = days × guide.daily_rate_usd
platform_commission  = total_amount_usd × 0.12   (12%)
guide_payout_usd     = total_amount_usd − platform_commission
```

Both amounts are calculated server-side on booking creation (`POST /bookings`) and stored in the `bookings` row. The client shows the breakdown to the tourist in the BookingScreen before confirmation. The guide sees their payout (not the total + commission) in their BookingsScreen.

The 12% rate is the midpoint of a 10–15% band. Future work: make this `booking_type`-dependent (day trips slightly lower, multi-day slightly higher) or negotiated per guide tier.

---

## 3. API Endpoints

### `POST /bookings` — create a booking

Request body:
```json
{
  "guide_id": "uuid",
  "booking_type": "day_trip | multi_day | custom",
  "start_date": "2026-09-01",
  "end_date": "2026-09-08",
  "total_amount_usd": 560,
  "notes": "Group of 3, intermediate fitness level"
}
```

Server-side: resolves `tourist_id` from the JWT (client cannot spoof it). Validates guide is verified + available. Calculates commission + payout. Returns the created booking row. Fires push notification to the guide.

### `GET /bookings` — list caller's bookings

Returns bookings where the caller is the tourist or guide (RLS-enforced). Joined with `guides(name, photo_url, location)` for display.

### `PATCH /bookings/{id}/status` — advance state machine

```json
{ "status": "confirmed" }
```

Determines caller's role (tourist vs. guide) from the JWT. Validates the transition against the state machine. Returns the updated booking. Fires push notification on key transitions (confirmed, cancelled).

### `POST /bookings/push-token` — register Expo push token

```json
{ "token": "ExponentPushToken[xxxxxx]", "platform": "ios" }
```

Upserts into `push_tokens`. Called on every app launch after Expo returns a push token.

---

## 4. Push Notifications

| Trigger | Recipient | Message |
|---|---|---|
| Tourist creates booking (pending) | Guide | "New Booking Request — {tourist} wants to book you starting {date}" |
| Guide confirms (confirmed) | Tourist | "Booking Confirmed! — {guide} confirmed your booking" |
| Guide cancels (cancelled) | Tourist | "Booking Cancelled — your booking with {guide} was cancelled" |
| Tourist cancels (cancelled) | Guide | "Booking Cancelled — {tourist} cancelled their booking" |

All notifications are fire-and-forget (`asyncio.create_task`). A failed push never rolls back the booking status change. Invalid / expired Expo tokens are deleted from `push_tokens` on first failure.

Tokens are stored in `push_tokens` (one row per user+device, unique on `(user_id, token)`). A user with multiple devices receives a notification on all of them.

---

## 5. Supabase Realtime

Both the tourist and guide apps subscribe to `postgres_changes` on the `bookings` table:

```typescript
supabase
  .channel("bookings")
  .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, handler)
  .subscribe();
```

RLS ensures each subscriber only receives events for their own bookings. When the guide confirms, the tourist's BookingsScreen status badge updates without a pull-to-refresh.

**What updates in real time:**
- Tourist app: new booking insert + status badge changes (pending → confirmed → in_progress → completed)
- Guide app: new booking insert from a tourist

**What doesn't (yet):** the guide's booking screen only subscribes to INSERT, not UPDATE — pull-to-refresh or the Accept/Decline action triggers a local state update instead. This avoids a Realtime subscription race condition where the guide's own status update triggers another re-render.

---

## 6. Tourist Booking UX

```
Planner tab (search)
    │
    │  type "10-day EBC, English-speaking guide"
    │  matchGuides() → vector similarity search
    ▼
Guide cards list
    │
    │  tap guide card
    ▼
GuideDetailScreen
    │  shows: photo, rating, specializations, verifications, reviews
    │
    │  tap "Book This Guide"
    ▼
BookingScreen
    │  select: trip type, start date, end date
    │  price preview: days × rate, commission breakdown, total
    │
    │  tap "Confirm Booking"
    │  createBooking() → POST /bookings
    ▼
Alert: "Booking Sent!"
    │
    │  navigate to Bookings tab
    ▼
BookingsScreen (Realtime)
    │  shows new booking with status "Awaiting Guide"
    │  status badge updates live when guide responds
```

---

## 7. Guide Booking UX

```
Bookings tab
    │
    │  Realtime: new booking appears instantly
    │  yellow banner: "1 booking request awaiting your response"
    ▼
BookingCard (pending)
    │  shows: dates, days, booking type, tourist notes
    │  shows: your earnings (guide_payout_usd)
    │
    ├── Accept → PATCH /bookings/{id}/status confirmed
    │             tourist notified via push
    │
    └── Decline → confirm dialog → PATCH /bookings/{id}/status cancelled
                  tourist notified via push
```

After accepting:
- Card shows "Confirmed" badge
- "Start Trip" button appears
- Guide taps "Start Trip" → `in_progress`
- Guide taps "Mark Complete" → `completed`

---

## 8. Security Invariants

1. **tourist_id is never client-supplied.** It is always resolved from the JWT's `sub` claim via a server-side `tourists` lookup.
2. **guide_id validation on create.** The booked guide must exist, be NTB-verified, and be marked available.
3. **Role-based transition enforcement.** A tourist cannot confirm their own booking. A guide cannot mark a booking complete before it's `in_progress`. Each transition is checked against the `_TRANSITIONS` map keyed by `(current_status, actor_role)`.
4. **RLS on all reads.** `GET /bookings` returns only bookings where `tourist.user_id = auth.uid()` OR `guide.user_id = auth.uid()`. A user cannot read another user's booking details.
5. **Commission calculated server-side.** The client shows a preview but the authoritative amounts (`platform_commission_usd`, `guide_payout_usd`) are computed on the server and stored at creation time. The client cannot influence the commission rate.

---

## 9. Payout Schedule (placeholder)

Full Stripe integration is Stage 7. For now, payouts are manual. The `guide_payout_usd` column records the owed amount. NTB can export the bookings table to generate a monthly payout file.

When Stripe is integrated:
- `PaymentIntent` created on booking confirmation (status = `confirmed`)
- Captured on trip completion (status = `completed`)
- Stripe Connect used for guide payouts (direct transfers to guide's bank account)
- 12% platform fee retained automatically via Stripe application fee

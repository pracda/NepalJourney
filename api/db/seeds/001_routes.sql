-- Seed data: reference trekking routes used by the trip planner agent
-- and shown in the tourist app's route picker.

insert into routes (
    name, slug, description, difficulty,
    duration_days_min, duration_days_max, max_elevation_meters,
    permits_required, best_months,
    estimated_cost_usd_min, estimated_cost_usd_max
) values
(
    'Everest Base Camp',
    'everest-base-camp',
    'The classic trek to the foot of the world''s tallest mountain, passing through Sherpa villages and Sagarmatha National Park.',
    'challenging',
    12, 16, 5364,
    array['Sagarmatha National Park Permit', 'Khumbu Pasang Lhamu Rural Municipality Permit', 'TIMS'],
    array[3, 4, 5, 9, 10, 11],
    1200, 2500
),
(
    'Annapurna Circuit',
    'annapurna-circuit',
    'A classic loop trek circling the Annapurna massif, crossing the high Thorong La pass and descending into the Kali Gandaki valley.',
    'moderate-challenging',
    15, 20, 5416,
    array['ACAP Permit', 'TIMS'],
    array[3, 4, 5, 10, 11],
    900, 1800
),
(
    'Annapurna Base Camp',
    'annapurna-base-camp',
    'A shorter, scenic trek into the Annapurna Sanctuary with close-up mountain views and fewer high-altitude risks than the full circuit.',
    'moderate',
    7, 12, 4130,
    array['ACAP Permit', 'TIMS'],
    array[3, 4, 5, 9, 10, 11, 12],
    600, 1200
),
(
    'Manaslu Circuit',
    'manaslu-circuit',
    'A remote, less-crowded circuit around the eighth-highest peak in the world, requiring a restricted area permit.',
    'challenging',
    14, 18, 5106,
    array['Manaslu Restricted Area Permit', 'ACAP Permit', 'MCAP Permit'],
    array[3, 4, 5, 10, 11],
    1100, 2200
),
(
    'Langtang Valley',
    'langtang-valley',
    'A shorter, accessible trek close to Kathmandu through Tamang villages and Langtang National Park, good for limited-time itineraries.',
    'moderate',
    7, 10, 4984,
    array['Langtang National Park Permit', 'TIMS'],
    array[3, 4, 5, 9, 10, 11, 12],
    500, 1000
)
on conflict (slug) do nothing;

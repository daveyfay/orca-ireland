-- ORCA Ireland Legacy Member Import
-- Run in Supabase SQL Editor
-- Imports name + email only. Members re-enter phone/ICE on registration.
-- DOB deliberately excluded (GDPR - not required for club operations)

-- Step 1: Add legacy_member column if not exists
ALTER TABLE members ADD COLUMN IF NOT EXISTS legacy_member BOOLEAN DEFAULT FALSE;

-- Step 2: Insert legacy members
-- Uses ON CONFLICT DO NOTHING to avoid duplicates if run twice
-- No password_hash - members must register through new flow
-- expiry_date set to 2025-12-31 (expired) so they must renew

INSERT INTO members (first_name, last_name, email, username, password_hash, membership_type, expiry_date, legacy_member)
VALUES
  ('Graeme',   'Lougheed',    'graememlougheed@gmail.com',     'graemelougheed',   '', 'full', '2025-12-31', TRUE),
  ('Austin',   'Elliott',     'spuddyelliott@gmail.com',       'austinelliott',    '', 'full', '2025-12-31', TRUE),
  ('Lee',      'Kelly',       'ljk.kelly@yahoo.co.uk',         'leekelly',         '', 'full', '2025-12-31', TRUE),
  ('Adrian',   'Legge',       'adrian.legge@gmail.com',        'adrianlegge',      '', 'full', '2025-12-31', TRUE),
  ('Eugen',    'Adrian',      'eugenadrian45@gmail.com',       'eugenadrian',      '', 'full', '2025-12-31', TRUE),
  ('Kyle',     'OToole',      'kyleotoole91@gmail.com',        'kyleotoole',       '', 'full', '2025-12-31', TRUE),
  ('Bruno',    'Barbosa',     'brunobarbosa@mail.com',         'brunobarbosa',     '', 'full', '2025-12-31', TRUE),
  ('Denis',    'Fox',         'denispfox@gmail.com',           'denisfox',         '', 'full', '2025-12-31', TRUE),
  ('Jason',    'Noonan',      'jasonnoonan12345@gmail.com',    'jasonnoonan',      '', 'full', '2025-12-31', TRUE),
  ('Gary',     'Sheil',       'redbaron.sheil@gmail.com',      'garysheil',        '', 'full', '2025-12-31', TRUE),
  ('Michael',  'Byrne',       'byrnemick@hotmail.com',         'michaelbyrne',     '', 'full', '2025-12-31', TRUE),
  ('Liam',     'Elliott',     'liamdavidelliott123@gmail.com', 'liamelliott',      '', 'full', '2025-12-31', TRUE),
  ('Warren',   'Long',        'warlong77@gmail.com',           'warrenlong',       '', 'full', '2025-12-31', TRUE),
  ('Stephen',  'OConnor',     'steoconnor97@gmail.com',        'stephenoconnor',   '', 'full', '2025-12-31', TRUE),
  ('Thomas',   'Ward',        'tommy_ward1@outlook.com',       'thomasward',       '', 'full', '2025-12-31', TRUE),
  ('Clive',    'Connolly',    'clive.connolly@gmail.com',      'cliveconnolly',    '', 'full', '2025-12-31', TRUE),
  ('John',     'McDonnell',   'johnmcd66@gmail.com',           'johnmcdonnell',    '', 'full', '2025-12-31', TRUE),
  ('Eduard',   'Vichta',      'eddiex@seznam.cz',              'eduardvichta',     '', 'full', '2025-12-31', TRUE),
  ('Stanislav','Balon',       'stanislavbalon0@gmail.com',     'stanislavbalon',   '', 'full', '2025-12-31', TRUE),
  ('Dave',     'Fay',         'dav3y.fay@gmail.com',           'davefay',          '', 'full', '2025-12-31', TRUE),
  ('Zeph',     'Kearns',      'kearns.mark@gmail.com',         'zephkearns',       '', 'full', '2025-12-31', TRUE),
  ('Eoin',     'Grenham',     'eoingrenham@gmail.com',         'eoingrenham',      '', 'full', '2025-12-31', TRUE),
  ('Adam',     'Matthews',    'adamfredrick@hotmail.com',      'adammatthews',     '', 'full', '2025-12-31', TRUE),
  ('Ronan',    'Barker',      'ronanbarker@gmail.com',         'ronanbarker',      '', 'full', '2025-12-31', TRUE),
  ('Gary',     'Humphries',   'garyhumphries11@gmail.com',     'garyhumphries',    '', 'full', '2025-12-31', TRUE),
  ('Bruno',    'Barbosa',     'brunobarbosa@live.com',         'brunobarbosa2',    '', 'full', '2025-12-31', TRUE),
  ('David',    'Sheehan',     'dsheehan2011@gmail.com',        'davidsheehan',     '', 'full', '2025-12-31', TRUE),
  ('Darran',   'Fitzpatrick', 'darfitz.df@gmail.com',          'darranfitzpatrick','', 'full', '2025-12-31', TRUE),
  ('Neil',     'Daly',        'neildaly85@gmail.com',          'neildaly',         '', 'full', '2025-12-31', TRUE)
ON CONFLICT (email) DO NOTHING;

-- Verify import
SELECT COUNT(*) as legacy_members_imported FROM members WHERE legacy_member = TRUE;

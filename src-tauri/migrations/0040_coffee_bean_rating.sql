ALTER TABLE coffee_beans ADD COLUMN rating INTEGER;
ALTER TABLE coffee_beans ADD COLUMN flavor_tags TEXT NOT NULL DEFAULT '[]';

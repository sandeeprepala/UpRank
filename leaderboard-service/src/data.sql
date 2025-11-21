CREATE TABLE IF NOT EXISTS leaderboard (
    user_id     TEXT PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    region      VARCHAR(50) NOT NULL,
    score       BIGINT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMP DEFAULT NOW()
);

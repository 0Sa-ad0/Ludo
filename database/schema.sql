-- Ludo Game Database Schema
-- Run this in phpMyAdmin or MySQL CLI before starting the game

CREATE DATABASE IF NOT EXISTS ludo_game CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ludo_game;

-- Stores each game room
CREATE TABLE IF NOT EXISTS games (
  id VARCHAR(36) PRIMARY KEY,
  room_code VARCHAR(8) NOT NULL UNIQUE,
  password_hash VARCHAR(255) DEFAULT NULL,
  player_count INT NOT NULL DEFAULT 4,
  status ENUM('waiting', 'playing', 'finished') NOT NULL DEFAULT 'waiting',
  current_player_index INT NOT NULL DEFAULT 0,
  board_state JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_room_code (room_code),
  INDEX idx_status (status)
);

-- Stores each player in a game
CREATE TABLE IF NOT EXISTS players (
  id VARCHAR(36) PRIMARY KEY,
  game_id VARCHAR(36) NOT NULL,
  name VARCHAR(50) NOT NULL,
  color_index INT NOT NULL,
  slot_index INT NOT NULL,
  socket_id VARCHAR(100) DEFAULT NULL,
  is_connected BOOLEAN NOT NULL DEFAULT FALSE,
  is_auto BOOLEAN NOT NULL DEFAULT FALSE,
  is_finished BOOLEAN NOT NULL DEFAULT FALSE,
  finish_rank INT DEFAULT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  INDEX idx_game_id (game_id),
  INDEX idx_socket_id (socket_id)
);

-- Leaderboard (persistent across all games)
CREATE TABLE IF NOT EXISTS leaderboard (
  id INT AUTO_INCREMENT PRIMARY KEY,
  player_name VARCHAR(50) NOT NULL,
  wins INT NOT NULL DEFAULT 0,
  games_played INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_player (player_name)
);

-- Auto-cleanup old finished games (run periodically or via event)
-- DELETE FROM games WHERE status = 'finished' AND updated_at < NOW() - INTERVAL 24 HOUR;

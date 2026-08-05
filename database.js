const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use /app/data for Railway volume, fall back to local dir for development
const dataDir = fs.existsSync('/app/data') ? '/app/data' : __dirname;
const db = new Database(path.join(dataDir, 'bot.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    discord_user_id TEXT PRIMARY KEY,
    username TEXT DEFAULT 'Unknown',
    money INTEGER DEFAULT 0,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,
    last_daily TEXT DEFAULT '',
    last_work TEXT DEFAULT '',
    last_rob TEXT DEFAULT '',
    last_activity_xp TEXT DEFAULT '',
    gamble_streak INTEGER DEFAULT 0,
    vc_minutes INTEGER DEFAULT 0,
    shield_until TEXT DEFAULT '',
    lucky_charm INTEGER DEFAULT 0,
    xp_boost_until TEXT DEFAULT '',
    last_work_job TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS mailbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT,
    mentioned_user_id TEXT,
    message_content TEXT,
    message_id TEXT,
    read INTEGER DEFAULT 0,
    sender_id TEXT,
    sender_name TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS robberies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    robber_id TEXT,
    robber_name TEXT,
    victim_id TEXT,
    victim_name TEXT,
    status TEXT DEFAULT 'active',
    steal_amount INTEGER DEFAULT 0,
    penalty_amount INTEGER DEFAULT 0,
    steal_percent INTEGER DEFAULT 0,
    channel_id TEXT,
    created_at TEXT
  );
`);

function getOrCreateUser(discordUserId, username) {
  let user = db.prepare('SELECT * FROM users WHERE discord_user_id = ?').get(discordUserId);
  if (!user) {
    db.prepare('INSERT INTO users (discord_user_id, username) VALUES (?, ?)').run(discordUserId, username);
    user = db.prepare('SELECT * FROM users WHERE discord_user_id = ?').get(discordUserId);
  }
  if (user.username !== username && username && username !== 'Unknown') {
    db.prepare('UPDATE users SET username = ? WHERE discord_user_id = ?').run(username, discordUserId);
    user.username = username;
  }
  return user;
}

function updateUser(discordUserId, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map(k => k + ' = ?').join(', ');
  const vals = keys.map(k => fields[k]);
  db.prepare('UPDATE users SET ' + sets + ' WHERE discord_user_id = ?').run(...vals, discordUserId);
}

function levelFromXP(xp) { return Math.floor(Math.sqrt(xp / 100)); }
function xpForLevel(level) { return level * level * 100; }

function addXPAndMoney(discordUserId, xpGain, moneyGain) {
  const user = db.prepare('SELECT * FROM users WHERE discord_user_id = ?').get(discordUserId);
  if (!user) return { leveledUp: false, newLevel: 0 };
  const oldLevel = user.level || levelFromXP(user.xp);
  const newXP = user.xp + xpGain;
  const newLevel = levelFromXP(newXP);
  const newMoney = Math.max(0, user.money + moneyGain);
  db.prepare('UPDATE users SET xp = ?, level = ?, money = ? WHERE discord_user_id = ?').run(newXP, newLevel, newMoney, discordUserId);
  return { leveledUp: newLevel > oldLevel, newLevel, newXP, newMoney };
}

function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}
function setConfig(key, value) {
  const existing = db.prepare('SELECT key FROM config WHERE key = ?').get(key);
  if (existing) db.prepare('UPDATE config SET value = ? WHERE key = ?').run(String(value), key);
  else db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(key, String(value));
}

function createRobbery(data) {
  const result = db.prepare('INSERT INTO robberies (robber_id, robber_name, victim_id, victim_name, status, steal_amount, penalty_amount, steal_percent, channel_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    data.robberId, data.robberName, data.victimId, data.victimName, 'active', data.stealAmount, data.penaltyAmount, data.stealPercent, data.channelId, data.createdAt
  );
  return result.lastInsertRowid;
}
function getRobbery(id) {
  return db.prepare('SELECT * FROM robberies WHERE id = ?').get(id);
}
function getActiveRobberies(victimId) {
  return db.prepare('SELECT * FROM robberies WHERE victim_id = ? AND status = ?').all(victimId, 'active');
}
function updateRobbery(id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map(k => k + ' = ?').join(', ');
  const vals = keys.map(k => fields[k]);
  db.prepare('UPDATE robberies SET ' + sets + ' WHERE id = ?').run(...vals, id);
}

function getMailbox(userId) {
  return db.prepare('SELECT * FROM mailbox WHERE mentioned_user_id = ? ORDER BY created_date DESC').all(userId);
}
function addMailbox(data) {
  db.prepare('INSERT INTO mailbox (channel_id, mentioned_user_id, message_content, message_id, sender_id, sender_name) VALUES (?, ?, ?, ?, ?, ?)').run(
    data.channelId, data['mentionedUserId'], data['messageContent'], data['messageId'], data.senderId, data.senderName
  );
}
function markMailboxRead(userId) {
  db.prepare('UPDATE mailbox SET read = 1 WHERE mentioned_user_id = ?').run(userId);
}

module.exports = {
  db, getOrCreateUser, updateUser, levelFromXP, xpForLevel, addXPAndMoney,
  getConfig, setConfig, createRobbery, getRobbery, getActiveRobberies, updateRobbery,
  getMailbox, addMailbox, markMailboxRead
};

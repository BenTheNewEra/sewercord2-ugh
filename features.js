// ============================================================
//  features.js — Extended commands for Sewercord Bot
//  Blackjack, Slots, Fishing, Heist, Stocks, Achievements,
//  Love Letter, Trivia, Pets, Server Stats, Slowmode, Lock
// ============================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

// ── helpers ──────────────────────────────────────────────────
function fmtNum(n) { return (n || 0).toLocaleString(); }
function rnd(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

// ════════════════════════════════════════════════════════════
//  DATABASE EXTENSIONS
// ════════════════════════════════════════════════════════════
function initFeatureTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fishing_cooldowns (
      user_id TEXT PRIMARY KEY,
      last_fish TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS fish_inventory (
      user_id TEXT,
      fish_name TEXT,
      quantity INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, fish_name)
    );
    CREATE TABLE IF NOT EXISTS heists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leader_id TEXT,
      leader_name TEXT,
      channel_id TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT,
      target_amount INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS heist_members (
      heist_id INTEGER,
      user_id TEXT,
      username TEXT,
      PRIMARY KEY (heist_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS stocks (
      symbol TEXT PRIMARY KEY,
      name TEXT,
      price REAL DEFAULT 100,
      last_updated TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS stock_portfolio (
      user_id TEXT,
      symbol TEXT,
      shares INTEGER DEFAULT 0,
      avg_buy_price REAL DEFAULT 0,
      PRIMARY KEY (user_id, symbol)
    );
    CREATE TABLE IF NOT EXISTS achievements (
      user_id TEXT,
      achievement TEXT,
      earned_at TEXT,
      PRIMARY KEY (user_id, achievement)
    );
    CREATE TABLE IF NOT EXISTS love_letters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id TEXT,
      sender_name TEXT,
      target_id TEXT,
      message TEXT,
      sent_at TEXT
    );
    CREATE TABLE IF NOT EXISTS pets (
      user_id TEXT PRIMARY KEY,
      pet_name TEXT,
      pet_type TEXT,
      level INTEGER DEFAULT 1,
      xp INTEGER DEFAULT 0,
      last_fed TEXT DEFAULT '',
      happiness INTEGER DEFAULT 100,
      evo_stage INTEGER DEFAULT 0,
      evo_name TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS trivia_scores (
      user_id TEXT PRIMARY KEY,
      correct INTEGER DEFAULT 0,
      wrong INTEGER DEFAULT 0
    );
  `);

  // Migrate pets table: add evo columns if missing
  try { db.exec("ALTER TABLE pets ADD COLUMN evo_stage INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE pets ADD COLUMN evo_name TEXT DEFAULT ''"); } catch {}

  // Remove old stocks that no longer exist
  db.prepare("DELETE FROM stocks WHERE symbol IN ('GOON', 'GRAPE')").run();

  // Seed/upsert current stock list
  const desiredStocks = [
    ['SEWER',    'Sewer Corp',       100],
    ['COIN',     'CoinMint Inc',     250],
    ['BLAZE',    'Blaze Capital',    180],
    ['GOONING',  'Gooning Stocks',   1000],
    ['SAI',      'Sai',              50000],
    ['INFINITY', 'Infinity Stocks',  50000],
  ];
  const upsert = db.prepare('INSERT INTO stocks (symbol, name, price, last_updated) VALUES (?, ?, ?, ?) ON CONFLICT(symbol) DO UPDATE SET name = excluded.name');
  for (const [sym, name, price] of desiredStocks) {
    const exists = db.prepare('SELECT symbol FROM stocks WHERE symbol = ?').get(sym);
    if (!exists) {
      upsert.run(sym, name, price, new Date().toISOString());
    } else if (['SAI','INFINITY'].includes(sym)) {
      // Fix stocks that were seeded at 100M — reset to correct price
      const row = db.prepare('SELECT price FROM stocks WHERE symbol = ?').get(sym);
      if (row && (row.price > 1000000 || row.price < 50000)) {
        db.prepare('UPDATE stocks SET price = ?, name = ?, last_updated = ? WHERE symbol = ?').run(price, name, new Date().toISOString(), sym);
      }
    }
  }
}

// ════════════════════════════════════════════════════════════
//  ACHIEVEMENTS
// ════════════════════════════════════════════════════════════
const ACHIEVEMENT_LIST = {
  first_daily:    { label: '📅 First Daily',       desc: 'Claimed your first daily reward' },
  level_5:        { label: '⭐ Level 5',            desc: 'Reached Level 5' },
  level_10:       { label: '🌟 Level 10',           desc: 'Reached Level 10' },
  level_25:       { label: '💫 Level 25',           desc: 'Reached Level 25' },
  rich_1k:        { label: '💰 First Thousand',     desc: 'Accumulated 1,000 coins' },
  rich_10k:       { label: '🤑 High Roller',        desc: 'Accumulated 10,000 coins' },
  first_rob:      { label: '🔫 First Robbery',      desc: 'Attempted your first robbery' },
  first_fish:     { label: '🎣 Gone Fishing',       desc: 'Caught your first fish' },
  first_pet:      { label: '🐾 Pet Owner',          desc: 'Adopted your first pet' },
  gamble_5:       { label: '🎲 Lucky Five',         desc: 'Won 5 gambles in a row' },
  trivia_10:      { label: '🧠 Trivia Nerd',        desc: 'Got 10 trivia answers correct' },
  heist_win:      { label: '💼 Mastermind',         desc: 'Won a heist' },
};

function checkAndAwardAchievements(db, userId, username, triggers) {
  const earned = [];
  const existing = db.prepare('SELECT achievement FROM achievements WHERE user_id = ?').all(userId).map(r => r.achievement);

  for (const key of triggers) {
    if (ACHIEVEMENT_LIST[key] && !existing.includes(key)) {
      db.prepare('INSERT INTO achievements (user_id, achievement, earned_at) VALUES (?, ?, ?)').run(userId, key, new Date().toISOString());
      earned.push(ACHIEVEMENT_LIST[key].label);
    }
  }
  return earned;
}

function handleAchievements(interaction, db) {
  const userId = interaction.user.id;
  const rows = db.prepare('SELECT achievement, earned_at FROM achievements WHERE user_id = ? ORDER BY earned_at ASC').all(userId);
  if (!rows.length) {
    return interaction.reply({ content: '🏆 You have no achievements yet. Keep playing!', ephemeral: true });
  }
  const lines = rows.map(r => {
    const a = ACHIEVEMENT_LIST[r.achievement];
    return a ? `${a.label} — *${a.desc}*` : r.achievement;
  }).join('\n');
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${interaction.user.username}'s Achievements`)
    .setColor(0xF1C40F)
    .setDescription(lines)
    .setFooter({ text: `${rows.length}/${Object.keys(ACHIEVEMENT_LIST).length} unlocked` });
  return interaction.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  BLACKJACK
// ════════════════════════════════════════════════════════════
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ s, r });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function cardVal(r) { if (['J','Q','K'].includes(r)) return 10; if (r === 'A') return 11; return parseInt(r); }
function handVal(hand) {
  let val = 0, aces = 0;
  for (const c of hand) { val += cardVal(c.r); if (c.r === 'A') aces++; }
  while (val > 21 && aces > 0) { val -= 10; aces--; }
  return val;
}
function handStr(hand, hideSecond = false) {
  if (hideSecond) return `${hand[0].r}${hand[0].s} 🂠`;
  return hand.map(c => `${c.r}${c.s}`).join(' ');
}

const bjGames = new Map(); // userId -> game state

async function handleBlackjack(interaction, db, getOrCreateUser, updateUser, addXPAndMoney, checkAndAward) {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const amount = interaction.options.getInteger('amount');
  if (!amount || amount < 100) return interaction.reply({ content: 'Please provide a bet of at least **100 coins**. Usage: `/bj 100`', ephemeral: true });
  const user = getOrCreateUser(userId, username);
  if (user.money < 100) return interaction.reply({ content: 'You need at least **100 coins** to play blackjack!', ephemeral: true });
  if (user.money < amount) return interaction.reply({ content: `You only have ${fmtNum(user.money)} coins!`, ephemeral: true });

  const deck = newDeck();
  const player = [deck.pop(), deck.pop()];
  const dealer = [deck.pop(), deck.pop()];
  bjGames.set(userId, { deck, player, dealer, bet: amount, userId, username });

  updateUser(userId, { money: user.money - amount });

  const pVal = handVal(player);
  const embed = new EmbedBuilder()
    .setTitle('🃏 Blackjack')
    .setColor(0x2ECC71)
    .addFields(
      { name: 'Your Hand', value: `${handStr(player)} — **${pVal}**`, inline: true },
      { name: "Dealer's Hand", value: `${handStr(dealer, true)} — **?**`, inline: true },
    )
    .setFooter({ text: `Bet: ${fmtNum(amount)} coins` });

  if (pVal === 21) {
    const winnings = Math.floor(amount * 2.5);
    updateUser(userId, { money: user.money - amount + winnings });
    bjGames.delete(userId);
    embed.setDescription(`🎉 **Blackjack!** You win **${fmtNum(winnings)}** coins!`).setColor(0xF1C40F);
    return interaction.reply({ embeds: [embed] });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj_hit:${userId}`).setLabel('Hit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bj_stand:${userId}`).setLabel('Stand').setStyle(ButtonStyle.Secondary),
  );
  return interaction.reply({ embeds: [embed], components: [row] });
}

async function handleBjButton(interaction, db, getOrCreateUser, updateUser, addXPAndMoney, checkAndAward) {
  const [action, ownerId] = interaction.customId.split(':');
  if (interaction.user.id !== ownerId) return interaction.reply({ content: 'Not your game!', ephemeral: true });

  const game = bjGames.get(ownerId);
  if (!game) return interaction.reply({ content: 'No active game found. Start one with /bj.', ephemeral: true });

  const user = getOrCreateUser(ownerId, game.username);

  if (action === 'bj_hit') {
    game.player.push(game.deck.pop());
    const pVal = handVal(game.player);

    if (pVal > 21) {
      bjGames.delete(ownerId);
      const embed = new EmbedBuilder().setTitle('🃏 Blackjack').setColor(0xE74C3C)
        .addFields(
          { name: 'Your Hand', value: `${handStr(game.player)} — **${pVal}**`, inline: true },
          { name: "Dealer's Hand", value: `${handStr(game.dealer)} — **${handVal(game.dealer)}**`, inline: true },
        )
        .setDescription(`💥 **Bust!** You lose **${fmtNum(game.bet)}** coins.`);
      return interaction.update({ embeds: [embed], components: [] });
    }

    if (pVal === 21) {
      return handleBjStand(interaction, game, ownerId, user, db, updateUser, checkAndAward);
    }

    const embed = new EmbedBuilder().setTitle('🃏 Blackjack').setColor(0x2ECC71)
      .addFields(
        { name: 'Your Hand', value: `${handStr(game.player)} — **${pVal}**`, inline: true },
        { name: "Dealer's Hand", value: `${handStr(game.dealer, true)} — **?**`, inline: true },
      )
      .setFooter({ text: `Bet: ${fmtNum(game.bet)} coins` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bj_hit:${ownerId}`).setLabel('Hit').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`bj_stand:${ownerId}`).setLabel('Stand').setStyle(ButtonStyle.Secondary),
    );
    return interaction.update({ embeds: [embed], components: [row] });
  }

  if (action === 'bj_stand') {
    return handleBjStand(interaction, game, ownerId, user, db, updateUser, checkAndAward);
  }
}

async function handleBjStand(interaction, game, ownerId, user, db, updateUser, checkAndAward) {
  while (handVal(game.dealer) < 17) game.dealer.push(game.deck.pop());
  const pVal = handVal(game.player);
  const dVal = handVal(game.dealer);
  bjGames.delete(ownerId);

  let result, color, winnings = 0;
  if (dVal > 21 || pVal > dVal) {
    winnings = game.bet * 2;
    result = `🎉 **You win!** +${fmtNum(winnings)} coins!`;
    color = 0x2ECC71;
  } else if (pVal === dVal) {
    winnings = game.bet;
    result = `🤝 **Push!** Bet returned.`;
    color = 0x95A5A6;
  } else {
    result = `💥 **Dealer wins.** You lose ${fmtNum(game.bet)} coins.`;
    color = 0xE74C3C;
  }
  updateUser(ownerId, { money: user.money + winnings });

  const embed = new EmbedBuilder().setTitle('🃏 Blackjack').setColor(color)
    .setDescription(result)
    .addFields(
      { name: 'Your Hand', value: `${handStr(game.player)} — **${pVal}**`, inline: true },
      { name: "Dealer's Hand", value: `${handStr(game.dealer)} — **${dVal}**`, inline: true },
    );

  return interaction.update({ embeds: [embed], components: [] });
}

// ════════════════════════════════════════════════════════════
//  SLOTS
// ════════════════════════════════════════════════════════════
const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];
const SLOT_WEIGHTS = [30, 25, 20, 15, 6, 3, 1]; // out of 100

function spinSlot() {
  const total = SLOT_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
    r -= SLOT_WEIGHTS[i];
    if (r <= 0) return SLOT_SYMBOLS[i];
  }
  return SLOT_SYMBOLS[0];
}

function calcSlotPayout(reels, bet) {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    const multipliers = { '7️⃣': 50, '💎': 20, '⭐': 10, '🍇': 5, '🍊': 4, '🍋': 3, '🍒': 2 };
    return { mult: multipliers[a] || 2, label: '🎰 JACKPOT!' };
  }
  if (a === b || b === c || a === c) return { mult: 1.5, label: '✨ Two of a kind!' };
  if (reels.includes('🍒')) return { mult: 0.5, label: '🍒 Cherry consolation' };
  return { mult: 0, label: '💸 No match' };
}

function handleSlots(interaction, getOrCreateUser, updateUser) {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const amount = interaction.options.getInteger('amount');
  if (!amount || amount < 100) return interaction.reply({ content: 'Please provide a bet of at least **100 coins**. Usage: `/slots 100`', ephemeral: true });
  const user = getOrCreateUser(userId, username);
  if (user.money < 100) return interaction.reply({ content: 'You need at least **100 coins** to play slots!', ephemeral: true });
  if (user.money < amount) return interaction.reply({ content: `You only have ${fmtNum(user.money)} coins!`, ephemeral: true });

  const reels = [spinSlot(), spinSlot(), spinSlot()];
  const { mult, label } = calcSlotPayout(reels, amount);
  const winnings = Math.floor(amount * mult);
  const net = winnings - amount;
  updateUser(userId, { money: user.money + net });

  const color = net > 0 ? 0xF1C40F : net === 0 ? 0x95A5A6 : 0xE74C3C;
  const embed = new EmbedBuilder()
    .setTitle('🎰 Slots')
    .setColor(color)
    .setDescription(`**[ ${reels.join(' | ')} ]**\n\n${label}\n\n${net >= 0 ? `**+${fmtNum(winnings)}** coins!` : `**-${fmtNum(amount)}** coins.`}`)
    .setFooter({ text: `Balance: ${fmtNum(user.money + net)} coins` });
  return interaction.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  FISHING
// ════════════════════════════════════════════════════════════
const FISH_TABLE = [
  { name: 'Old Boot',     emoji: '👢', value: 0,   weight: 20 },
  { name: 'Sardine',      emoji: '🐟', value: 15,  weight: 30 },
  { name: 'Catfish',      emoji: '🐠', value: 35,  weight: 20 },
  { name: 'Bass',         emoji: '🎣', value: 60,  weight: 15 },
  { name: 'Salmon',       emoji: '🐡', value: 100, weight: 10 },
  { name: 'Swordfish',    emoji: '⚔️', value: 200, weight: 4  },
  { name: 'Golden Fish',  emoji: '✨', value: 500, weight: 1  },
];

function catchFish() {
  const total = FISH_TABLE.reduce((a, b) => a + b.weight, 0);
  let r = Math.random() * total;
  for (const f of FISH_TABLE) { r -= f.weight; if (r <= 0) return f; }
  return FISH_TABLE[0];
}

function handleFish(interaction, db, getOrCreateUser, updateUser, checkAndAward) {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  getOrCreateUser(userId, username);

  const now = new Date();
  let cd = db.prepare('SELECT * FROM fishing_cooldowns WHERE user_id = ?').get(userId);
  if (cd && cd.last_fish) {
    const elapsed = (now.getTime() - new Date(cd.last_fish).getTime()) / 60000;
    if (elapsed < 2) {
      const secs = Math.ceil((2 - elapsed) * 60);
      return interaction.reply({ content: `🎣 Bait's not ready! Wait **${secs}s** before fishing again.`, ephemeral: true });
    }
  }

  if (!cd) db.prepare('INSERT INTO fishing_cooldowns (user_id, last_fish) VALUES (?, ?)').run(userId, now.toISOString());
  else db.prepare('UPDATE fishing_cooldowns SET last_fish = ? WHERE user_id = ?').run(now.toISOString(), userId);

  const fish = catchFish();
  const user = getOrCreateUser(userId, username);

  if (fish.value > 0) {
    updateUser(userId, { money: user.money + fish.value });
    // Track in inventory
    const inv = db.prepare('SELECT * FROM fish_inventory WHERE user_id = ? AND fish_name = ?').get(userId, fish.name);
    if (inv) db.prepare('UPDATE fish_inventory SET quantity = quantity + 1 WHERE user_id = ? AND fish_name = ?').run(userId, fish.name);
    else db.prepare('INSERT INTO fish_inventory (user_id, fish_name, quantity) VALUES (?, ?, 1)').run(userId, fish.name);
  }

  const newBadges = checkAndAward(userId, username, ['first_fish']);

  const embed = new EmbedBuilder()
    .setTitle('🎣 Fishing')
    .setColor(fish.value >= 200 ? 0xF1C40F : 0x3498DB)
    .setDescription(
      fish.value === 0
        ? `You caught ${fish.emoji} **${fish.name}**... and threw it back.`
        : `You caught ${fish.emoji} **${fish.name}** and sold it for **+${fmtNum(fish.value)}** coins!`
    )
    .setFooter({ text: `Balance: ${fmtNum(user.money + fish.value)} coins` });

  if (newBadges.length) embed.addFields({ name: '🏆 Achievement Unlocked!', value: newBadges.join('\n') });
  return interaction.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  HEIST
// ════════════════════════════════════════════════════════════
const activeHeists = new Map(); // channelId -> heist data (in-memory for join window)

function handleHeist(interaction, db, getOrCreateUser, updateUser, addXPAndMoney, checkAndAward) {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const channelId = interaction.channelId;
  const user = getOrCreateUser(userId, username);

  if (user.money < 200) return interaction.reply({ content: 'You need at least **200 coins** to start a heist!', ephemeral: true });
  if (activeHeists.has(channelId)) return interaction.reply({ content: 'A heist is already being planned here!', ephemeral: true });

  const target = rnd(1000, 5000);
  const heistId = db.prepare('INSERT INTO heists (leader_id, leader_name, channel_id, status, created_at, target_amount) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, username, channelId, 'open', new Date().toISOString(), target).lastInsertRowid;

  db.prepare('INSERT INTO heist_members (heist_id, user_id, username) VALUES (?, ?, ?)').run(heistId, userId, username);

  activeHeists.set(channelId, { heistId, leaderId: userId, members: [{ userId, username }], target });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`heist_join:${heistId}:${channelId}`).setLabel('Join Heist').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`heist_start:${heistId}:${channelId}`).setLabel('Start (Leader)').setStyle(ButtonStyle.Danger),
  );
  const embed = new EmbedBuilder()
    .setTitle('💼 Heist Planning')
    .setColor(0xE67E22)
    .setDescription(`**${username}** is planning a heist!\n\nTarget vault: **${fmtNum(target)}** coins\nCrew so far: **${username}**\n\nJoin in the next 60 seconds or the leader can start early!`)
    .setFooter({ text: 'More crew = better odds' });

  setTimeout(() => {
    const heist = activeHeists.get(channelId);
    if (heist && heist.heistId === heistId) {
      executeHeist(null, heistId, channelId, db, getOrCreateUser, updateUser, addXPAndMoney, checkAndAward, interaction.channel);
    }
  }, 60000);

  return interaction.reply({ embeds: [embed], components: [row] });
}

async function handleHeistButton(interaction, db, getOrCreateUser, updateUser, addXPAndMoney, checkAndAward) {
  const parts = interaction.customId.split(':');
  const action = parts[0];
  const heistId = parseInt(parts[1]);
  const channelId = parts[2];
  const userId = interaction.user.id;
  const username = interaction.user.username;

  const heist = activeHeists.get(channelId);
  if (!heist || heist.heistId !== heistId) return interaction.reply({ content: 'This heist is no longer active!', ephemeral: true });

  if (action === 'heist_join') {
    if (heist.members.find(m => m.userId === userId)) return interaction.reply({ content: 'You already joined!', ephemeral: true });
    heist.members.push({ userId, username });
    db.prepare('INSERT OR IGNORE INTO heist_members (heist_id, user_id, username) VALUES (?, ?, ?)').run(heistId, userId, username);
    return interaction.reply({ content: `✅ **${username}** joined the heist! Crew size: **${heist.members.length}**` });
  }

  if (action === 'heist_start') {
    if (userId !== heist.leaderId) return interaction.reply({ content: 'Only the leader can start!', ephemeral: true });
    return executeHeist(interaction, heistId, channelId, db, getOrCreateUser, updateUser, addXPAndMoney, checkAndAward, null);
  }
}

async function executeHeist(interaction, heistId, channelId, db, getOrCreateUser, updateUser, addXPAndMoney, checkAndAward, channel) {
  const heist = activeHeists.get(channelId);
  if (!heist) return;
  activeHeists.delete(channelId);

  db.prepare("UPDATE heists SET status = 'closed' WHERE id = ?").run(heistId);

  const members = heist.members;
  const crewSize = members.length;
  // Base success chance 40%, +10% per extra member up to 80%
  const successChance = Math.min(0.8, 0.4 + (crewSize - 1) * 0.1);
  const success = Math.random() < successChance;

  let embed;
  if (success) {
    const totalLoot = heist.target;
    const share = Math.floor(totalLoot / crewSize);
    for (const m of members) {
      const u = getOrCreateUser(m.userId, m.username);
      updateUser(m.userId, { money: u.money + share });
      checkAndAward(m.userId, m.username, ['heist_win']);
    }
    const names = members.map(m => m.username).join(', ');
    embed = new EmbedBuilder()
      .setTitle('💼 Heist Success!')
      .setColor(0x2ECC71)
      .setDescription(`**The crew pulled it off!**\n\nCrew: ${names}\nTotal loot: **${fmtNum(totalLoot)}** coins\nEach member got: **+${fmtNum(share)}** coins!`);
  } else {
    const penalty = 100;
    for (const m of members) {
      const u = getOrCreateUser(m.userId, m.username);
      updateUser(m.userId, { money: Math.max(0, u.money - penalty) });
    }
    embed = new EmbedBuilder()
      .setTitle('💼 Heist Failed!')
      .setColor(0xE74C3C)
      .setDescription(`**The crew got caught!**\n\nEveryone lost **${fmtNum(penalty)}** coins.\nBetter luck next time.`);
  }

  try {
    if (interaction) return interaction.update({ embeds: [embed], components: [] });
    if (channel) await channel.send({ embeds: [embed] });
  } catch {}
}

// ════════════════════════════════════════════════════════════
//  STOCKS
// ════════════════════════════════════════════════════════════
function fluctuateStocks(db) {
  const stocks = db.prepare('SELECT * FROM stocks').all();
  for (const s of stocks) {
    const change = (Math.random() - 0.48) * 0.1; // slight upward bias
    const newPrice = Math.max(1, parseFloat((s.price * (1 + change)).toFixed(2)));
    db.prepare('UPDATE stocks SET price = ?, last_updated = ? WHERE symbol = ?').run(newPrice, new Date().toISOString(), s.symbol);
  }
}

function handleStocks(interaction, db, getOrCreateUser, updateUser) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const username = interaction.user.username;

  if (sub === 'market') {
    const stocks = db.prepare('SELECT * FROM stocks').all();
    const lines = stocks.map(s => `**${s.symbol}** — ${s.name} — 💰 ${fmtNum(s.price)} coins/share`).join('\n');
    const embed = new EmbedBuilder().setTitle('📈 Stock Market').setColor(0x2ECC71).setDescription(lines)
      .setFooter({ text: 'Prices fluctuate every 5 minutes' });
    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'portfolio') {
    const rows = db.prepare('SELECT * FROM stock_portfolio WHERE user_id = ? AND shares > 0').all(userId);
    if (!rows.length) return interaction.reply({ content: '📊 You have no stocks. Buy some with /stocks buy!', ephemeral: true });
    const stocks = db.prepare('SELECT * FROM stocks').all();
    const priceMap = Object.fromEntries(stocks.map(s => [s.symbol, s.price]));
    let totalValue = 0;
    const lines = rows.map(r => {
      const current = priceMap[r.symbol] || 0;
      const value = current * r.shares;
      totalValue += value;
      const gain = ((current - r.avg_buy_price) / r.avg_buy_price * 100).toFixed(1);
      const arrow = current >= r.avg_buy_price ? '📈' : '📉';
      return `${arrow} **${r.symbol}** x${r.shares} — ${fmtNum(value)} coins (${gain}%)`;
    }).join('\n');
    const embed = new EmbedBuilder().setTitle('📊 Your Portfolio').setColor(0x3498DB)
      .setDescription(lines)
      .addFields({ name: 'Total Value', value: `**${fmtNum(Math.floor(totalValue))}** coins` });
    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'buy') {
    const symbol = interaction.options.getString('symbol').toUpperCase();
    const shares = interaction.options.getInteger('shares');
    const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol);
    if (!stock) return interaction.reply({ content: `Unknown symbol. Use \`/stocks market\` to see available stocks.`, ephemeral: true });
    const cost = Math.floor(stock.price * shares);
    const user = getOrCreateUser(userId, username);
    if (user.money < cost) return interaction.reply({ content: `Need ${fmtNum(cost)} coins, you have ${fmtNum(user.money)}.`, ephemeral: true });
    updateUser(userId, { money: user.money - cost });
    const existing = db.prepare('SELECT * FROM stock_portfolio WHERE user_id = ? AND symbol = ?').get(userId, symbol);
    if (existing) {
      const totalShares = existing.shares + shares;
      const avgPrice = ((existing.avg_buy_price * existing.shares) + (stock.price * shares)) / totalShares;
      db.prepare('UPDATE stock_portfolio SET shares = ?, avg_buy_price = ? WHERE user_id = ? AND symbol = ?').run(totalShares, avgPrice, userId, symbol);
    } else {
      db.prepare('INSERT INTO stock_portfolio (user_id, symbol, shares, avg_buy_price) VALUES (?, ?, ?, ?)').run(userId, symbol, shares, stock.price);
    }
    return interaction.reply({ content: `✅ Bought **${shares}x ${symbol}** for **${fmtNum(cost)}** coins. Balance: ${fmtNum(user.money - cost)}.` });
  }

  if (sub === 'sell') {
    const symbol = interaction.options.getString('symbol').toUpperCase();
    const shares = interaction.options.getInteger('shares');
    const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol);
    if (!stock) return interaction.reply({ content: `Unknown symbol. Use \`/stocks market\` to see available stocks.`, ephemeral: true });
    const existing = db.prepare('SELECT * FROM stock_portfolio WHERE user_id = ? AND symbol = ?').get(userId, symbol);
    if (!existing || existing.shares < shares) return interaction.reply({ content: `You don't have ${shares} shares of ${symbol}.`, ephemeral: true });
    const earnings = Math.floor(stock.price * shares);
    const user = getOrCreateUser(userId, username);
    updateUser(userId, { money: user.money + earnings });
    const newShares = existing.shares - shares;
    db.prepare('UPDATE stock_portfolio SET shares = ? WHERE user_id = ? AND symbol = ?').run(newShares, userId, symbol);
    return interaction.reply({ content: `✅ Sold **${shares}x ${symbol}** for **${fmtNum(earnings)}** coins. Balance: ${fmtNum(user.money + earnings)}.` });
  }
}

// ════════════════════════════════════════════════════════════
//  LOVE LETTER
// ════════════════════════════════════════════════════════════
function handleLoveLetter(interaction, db, client) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === 'send') {
    const target = interaction.options.getUser('user');
    const message = interaction.options.getString('message');
    if (target.id === userId) return interaction.reply({ content: 'You cannot send a love letter to yourself!', ephemeral: true });
    if (target.bot) return interaction.reply({ content: 'Bots cannot receive love letters!', ephemeral: true });

    db.prepare('INSERT INTO love_letters (sender_id, sender_name, target_id, message, sent_at) VALUES (?, ?, ?, ?, ?)')
      .run(userId, interaction.user.username, target.id, message, new Date().toISOString());

    // Try to DM the target
    client.users.fetch(target.id).then(u => {
      u.send(`💌 **You received an anonymous love letter!**\n\n*"${message}"*`).catch(() => {});
    }).catch(() => {});

    return interaction.reply({ content: `💌 Your anonymous love letter has been delivered to **${target.username}**!`, ephemeral: true });
  }

  if (sub === 'inbox') {
    const letters = db.prepare('SELECT * FROM love_letters WHERE target_id = ? ORDER BY sent_at DESC LIMIT 10').all(userId);
    if (!letters.length) return interaction.reply({ content: '💌 No love letters yet. Maybe someone will write you one!', ephemeral: true });
    const lines = letters.map((l, i) => `**${i + 1}.** *"${l.message}"*`).join('\n\n');
    const embed = new EmbedBuilder().setTitle('💌 Your Love Letters').setColor(0xFF69B4).setDescription(lines);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

// ════════════════════════════════════════════════════════════
//  TRIVIA
// ════════════════════════════════════════════════════════════
const TRIVIA_QUESTIONS = [
  { q: 'What is the capital of France?', a: 'paris', choices: ['London', 'Paris', 'Berlin', 'Rome'] },
  { q: 'How many sides does a hexagon have?', a: '6', choices: ['5', '6', '7', '8'] },
  { q: 'What planet is known as the Red Planet?', a: 'mars', choices: ['Venus', 'Jupiter', 'Mars', 'Saturn'] },
  { q: 'Who wrote Romeo and Juliet?', a: 'shakespeare', choices: ['Dickens', 'Shakespeare', 'Hemingway', 'Tolkien'] },
  { q: 'What is 12 × 12?', a: '144', choices: ['124', '132', '144', '156'] },
  { q: 'What element has the symbol Au?', a: 'gold', choices: ['Silver', 'Gold', 'Copper', 'Iron'] },
  { q: 'How many continents are there?', a: '7', choices: ['5', '6', '7', '8'] },
  { q: 'What is the largest ocean?', a: 'pacific', choices: ['Atlantic', 'Indian', 'Pacific', 'Arctic'] },
  { q: 'What year did WW2 end?', a: '1945', choices: ['1943', '1944', '1945', '1946'] },
  { q: 'What is the speed of light (approx)?', a: '300000 km/s', choices: ['150000 km/s', '300000 km/s', '500000 km/s', '1000000 km/s'] },
  { q: 'Which gas do plants absorb?', a: 'co2', choices: ['Oxygen', 'CO2', 'Nitrogen', 'Hydrogen'] },
  { q: 'How many bones are in the human body?', a: '206', choices: ['186', '196', '206', '216'] },
  { q: 'What is the smallest prime number?', a: '2', choices: ['1', '2', '3', '5'] },
  { q: 'Who painted the Mona Lisa?', a: 'da vinci', choices: ['Picasso', 'Monet', 'Da Vinci', 'Raphael'] },
  { q: 'What is H2O?', a: 'water', choices: ['Hydrogen', 'Oxygen', 'Water', 'Salt'] },
];

const triviaActive = new Map(); // userId -> question

function handleTrivia(interaction, db, getOrCreateUser, updateUser, checkAndAward) {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const user = getOrCreateUser(userId, username);
  if (user.money < 50) return interaction.reply({ content: 'You need at least **50 coins** to play trivia (wrong answers cost 50 coins)!', ephemeral: true });

  const q = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
  triviaActive.set(userId, q);

  const shuffled = [...q.choices].sort(() => Math.random() - 0.5);
  const row = new ActionRowBuilder().addComponents(
    shuffled.map((c, i) =>
      new ButtonBuilder().setCustomId(`trivia_ans:${userId}:${i}:${c.toLowerCase().replace(/\s+/g, '_')}`).setLabel(c).setStyle(ButtonStyle.Primary)
    )
  );
  const embed = new EmbedBuilder().setTitle('🧠 Trivia').setColor(0x9B59B6)
    .setDescription(`**${q.q}**`)
    .setFooter({ text: 'Correct = +100 coins | Wrong = -50 coins | Max balance capped at 10,000' });
  return interaction.reply({ embeds: [embed], components: [row] });
}

async function handleTriviaButton(interaction, db, getOrCreateUser, updateUser, checkAndAward) {
  const parts = interaction.customId.split(':');
  const ownerId = parts[1];
  const answerRaw = parts[3].replace(/_/g, ' ');

  if (interaction.user.id !== ownerId) return interaction.reply({ content: 'Not your question!', ephemeral: true });

  const q = triviaActive.get(ownerId);
  if (!q) return interaction.reply({ content: 'No active trivia question.', ephemeral: true });
  triviaActive.delete(ownerId);

  const user = getOrCreateUser(ownerId, interaction.user.username);
  const correct = answerRaw === q.a;

  let scoreRow = db.prepare('SELECT * FROM trivia_scores WHERE user_id = ?').get(ownerId);
  if (!scoreRow) { db.prepare('INSERT INTO trivia_scores (user_id) VALUES (?)').run(ownerId); scoreRow = { correct: 0, wrong: 0 }; }

  if (correct) {
    updateUser(ownerId, { money: Math.min(user.money + 100, 10000) });
    db.prepare('UPDATE trivia_scores SET correct = correct + 1 WHERE user_id = ?').run(ownerId);
    const newCorrect = scoreRow.correct + 1;
    const badges = checkAndAward(ownerId, interaction.user.username, newCorrect >= 10 ? ['trivia_10'] : []);
    const embed = new EmbedBuilder().setTitle('🧠 Trivia — ✅ Correct!').setColor(0x2ECC71)
      .setDescription(`**${q.q}**\n\nAnswer: **${q.choices.find(c => c.toLowerCase() === q.a)}**\n\n**+100 coins!** Balance: ${fmtNum(Math.min(user.money + 100, 10000))}`)
      .setFooter({ text: `Score: ${newCorrect} correct` });
    if (badges.length) embed.addFields({ name: '🏆 Achievement Unlocked!', value: badges.join('\n') });
    return interaction.update({ embeds: [embed], components: [] });
  } else {
    const penalty = Math.min(50, user.money);
    updateUser(ownerId, { money: Math.max(0, user.money - 50) });
    db.prepare('UPDATE trivia_scores SET wrong = wrong + 1 WHERE user_id = ?').run(ownerId);
    const embed = new EmbedBuilder().setTitle('🧠 Trivia — ❌ Wrong!').setColor(0xE74C3C)
      .setDescription(`**${q.q}**\n\nCorrect answer: **${q.choices.find(c => c.toLowerCase() === q.a)}**\n\n**-${penalty} coins.** Balance: ${fmtNum(Math.max(0, user.money - 50))}`);
    return interaction.update({ embeds: [embed], components: [] });
  }
}

// ════════════════════════════════════════════════════════════
//  PETS
// ════════════════════════════════════════════════════════════
const PET_TYPES = ['🐶 Dog', '🐱 Cat', '🐹 Hamster', '🦊 Fox', '🐸 Frog', '🐧 Penguin', '🦎 Lizard', '🐺 Wolf'];

// Evolution stages per pet type: [stage0_base, stage1_lv5, stage2_lv10]
// Each stage: { emoji, label, description }
const PET_EVOLUTIONS = {
  '🐶 Dog':     [
    { emoji: '🐶', label: 'Puppy',      desc: 'A tiny fluffy pup, full of energy.' },
    { emoji: '🐕', label: 'Dog',        desc: 'Grown up and loyal — will follow you anywhere.' },
    { emoji: '🦴', label: 'Alpha Dog',  desc: 'Powerful and wise. Other dogs bow before them.' },
  ],
  '🐱 Cat':     [
    { emoji: '🐱', label: 'Kitten',     desc: 'Tiny and curious, knocks things off tables already.' },
    { emoji: '🐈', label: 'Cat',        desc: 'Independent and elegant. Condescending stare included.' },
    { emoji: '😼', label: 'Shadow Cat', desc: 'Moves silently through darkness. May or may not be a demon.' },
  ],
  '🐹 Hamster': [
    { emoji: '🐹', label: 'Hamster',    desc: 'Stuffs its cheeks and runs on a wheel all night.' },
    { emoji: '🐭', label: 'Mega Hmstr', desc: 'Surprisingly strong. Wheel spinning at dangerous RPM.' },
    { emoji: '⚡', label: 'Thunderpaw', desc: 'Generates electricity from sheer wheel momentum.' },
  ],
  '🦊 Fox':     [
    { emoji: '🦊', label: 'Fox Kit',    desc: 'Mischievous and playful. Already plotting something.' },
    { emoji: '🔶', label: 'Fox',        desc: 'Cunning and fast. Outsmarts everyone in the room.' },
    { emoji: '🌌', label: 'Spirit Fox', desc: 'Said to cross between worlds. Glows faintly at night.' },
  ],
  '🐸 Frog':    [
    { emoji: '🥚', label: 'Tadpole',    desc: 'Wiggles around in water, figuring out legs.' },
    { emoji: '🐸', label: 'Frog',       desc: "Croaks loudly at 3am. You didn't sleep anyway." },
    { emoji: '👑', label: 'Frog King',  desc: 'Wears an invisible crown. Commands rain itself.' },
  ],
  '🐧 Penguin': [
    { emoji: '🐣', label: 'Chick',      desc: 'Fluffy and round. Waddles even when stationary.' },
    { emoji: '🐧', label: 'Penguin',    desc: 'Formally dressed at all times. Very professional.' },
    { emoji: '❄️', label: 'Frost Lord', desc: 'Commands blizzards. Never slips on ice.' },
  ],
  '🦎 Lizard':  [
    { emoji: '🦎', label: 'Lizard',     desc: 'Flicks tongue at everything. Sunbathes constantly.' },
    { emoji: '🐊', label: 'Reptile',    desc: 'Cold-blooded and calculating. Respects no one.' },
    { emoji: '🐉', label: 'Mini Dragon',desc: 'Technically a dragon. Breathes very small flames.' },
  ],
  '🐺 Wolf':    [
    { emoji: '🐺', label: 'Wolf Pup',   desc: 'Howls at the moon. Has no idea what the moon is yet.' },
    { emoji: '🌕', label: 'Wolf',       desc: 'Runs with the pack. Intimidating yellow eyes.' },
    { emoji: '💀', label: 'Dire Wolf',  desc: 'Ancient and feared. The forest goes quiet when it walks.' },
  ],
};

// Get the current evolution stage object for a pet
function getPetEvolution(petType, level) {
  const stages = PET_EVOLUTIONS[petType];
  if (!stages) return { emoji: '🐾', label: petType, desc: '' };
  if (level >= 10) return stages[2];
  if (level >= 5)  return stages[1];
  return stages[0];
}

// Check if a level-up triggers an evolution
function getEvolutionThreshold(oldLevel, newLevel) {
  if (oldLevel < 5  && newLevel >= 5)  return 1;
  if (oldLevel < 10 && newLevel >= 10) return 2;
  return null;
}

function handlePet(interaction, db, getOrCreateUser, updateUser, checkAndAward) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const username = interaction.user.username;
  getOrCreateUser(userId, username);

  if (sub === 'adopt') {
    const existing = db.prepare('SELECT * FROM pets WHERE user_id = ?').get(userId);
    if (existing) return interaction.reply({ content: `You already have **${existing.pet_name}** (${existing.pet_type})! Use /pet status to check on them.`, ephemeral: true });
    const petName = interaction.options.getString('name');
    if (!petName || !petName.trim()) return interaction.reply({ content: 'Please provide a name for your pet! e.g. `/pet adopt Fluffy`', ephemeral: true });
    const typeChoice = interaction.options.getString('type');
    const petType = typeChoice || PET_TYPES[Math.floor(Math.random() * PET_TYPES.length)];
    if (typeChoice && !PET_TYPES.includes(typeChoice)) {
      const list = PET_TYPES.join('\n');
      return interaction.reply({ content: `Unknown pet type! Choose from:\n${list}`, ephemeral: true });
    }
    db.prepare('INSERT INTO pets (user_id, pet_name, pet_type, level, xp, last_fed, happiness, evo_stage, evo_name) VALUES (?, ?, ?, 1, 0, ?, 100, 0, ?)')
      .run(userId, petName.trim(), petType, new Date().toISOString(), '');
    const badges = checkAndAward(userId, username, ['first_pet']);
    const embed = new EmbedBuilder().setTitle('🐾 New Pet!').setColor(0x2ECC71)
      .setDescription(`You adopted a **${petType}** and named them **${petName.trim()}**! 🎉\n\nFeed them every hour with /pet feed to keep them happy and level them up!`);
    if (badges.length) embed.addFields({ name: '🏆 Achievement Unlocked!', value: badges.join('\n') });
    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'status') {
    const pet = db.prepare('SELECT * FROM pets WHERE user_id = ?').get(userId);
    if (!pet) return interaction.reply({ content: 'You have no pet! Adopt one with /pet adopt.', ephemeral: true });
    const evo = getPetEvolution(pet.pet_type, pet.level);
    const displayName = pet.evo_name && pet.evo_name.trim() ? pet.evo_name.trim() : evo.label;
    const happyBar = '💚'.repeat(Math.floor(pet.happiness / 10)) + '🖤'.repeat(10 - Math.floor(pet.happiness / 10));
    // Next evolution info
    let nextEvoText = '';
    if (pet.level < 5)       nextEvoText = `Evolves at **Level 5** → ${PET_EVOLUTIONS[pet.pet_type] ? PET_EVOLUTIONS[pet.pet_type][1].emoji + ' ' + PET_EVOLUTIONS[pet.pet_type][1].label : '?'}`;
    else if (pet.level < 10) nextEvoText = `Evolves at **Level 10** → ${PET_EVOLUTIONS[pet.pet_type] ? PET_EVOLUTIONS[pet.pet_type][2].emoji + ' ' + PET_EVOLUTIONS[pet.pet_type][2].label : '?'}`;
    else                     nextEvoText = '✨ **Max evolution reached!**';
    const stageStars = ['⚪', '🟡', '🔴'][pet.evo_stage || 0];
    const embed = new EmbedBuilder()
      .setTitle(`${evo.emoji} ${pet.pet_name} — ${displayName}`)
      .setColor(pet.level >= 10 ? 0xE74C3C : pet.level >= 5 ? 0xF1C40F : 0xFF69B4)
      .setDescription(`*${evo.desc}*`)
      .addFields(
        { name: 'Species', value: pet.pet_type, inline: true },
        { name: 'Stage', value: `${stageStars} Stage ${pet.evo_stage || 0}`, inline: true },
        { name: 'Level', value: String(pet.level), inline: true },
        { name: 'XP', value: `${pet.xp} / ${pet.level * 100}`, inline: true },
        { name: 'Happiness', value: `${happyBar} ${pet.happiness}%`, inline: true },
        { name: 'Next Evolution', value: nextEvoText, inline: false },
      );
    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'feed') {
    const pet = db.prepare('SELECT * FROM pets WHERE user_id = ?').get(userId);
    if (!pet) return interaction.reply({ content: 'You have no pet! Adopt one with /pet adopt.', ephemeral: true });
    const now = new Date();
    if (pet.last_fed) {
      const h = (now.getTime() - new Date(pet.last_fed).getTime()) / 3600000;
      if (h < 1) {
        const mins = Math.ceil((1 - h) * 60);
        return interaction.reply({ content: `${pet.pet_name} is full! Feed again in **${mins}m**.`, ephemeral: true });
      }
    }
    const user = getOrCreateUser(userId, username);
    if (user.money < 10) return interaction.reply({ content: 'Need at least 10 coins to buy pet food!', ephemeral: true });
    updateUser(userId, { money: user.money - 10 });

    const xpGain = rnd(10, 25);
    const rawXP = pet.xp + xpGain;
    const threshold = pet.level * 100;
    const leveledUp = rawXP >= threshold;
    const newLevel = leveledUp ? pet.level + 1 : pet.level;
    const newXP = leveledUp ? rawXP - threshold : rawXP;
    const newHappiness = Math.min(100, pet.happiness + 15);

    // Check for evolution
    const evoThreshold = leveledUp ? getEvolutionThreshold(pet.level, newLevel) : null;
    const newEvoStage = evoThreshold !== null ? evoThreshold : (pet.evo_stage || 0);
    db.prepare('UPDATE pets SET xp = ?, level = ?, last_fed = ?, happiness = ?, evo_stage = ? WHERE user_id = ?')
      .run(newXP, newLevel, now.toISOString(), newHappiness, newEvoStage, userId);

    const evo = getPetEvolution(pet.pet_type, newLevel);
    const displayName = pet.evo_name && pet.evo_name.trim() ? pet.evo_name.trim() : evo.label;
    let msg = `🍖 You fed **${pet.pet_name}**! +${xpGain} XP (${newXP}/${newLevel * 100}), happiness: ${newHappiness}%.`;
    if (leveledUp) {
      msg += `\n\n🎉 **${pet.pet_name} leveled up to Level ${newLevel}!**`;
      if (evoThreshold !== null) {
        const stageStars = ['⚪','🟡','🔴'][newEvoStage];
        msg += `\n\n✨ **${pet.pet_name} evolved into ${evo.emoji} ${displayName}!** ${stageStars} Stage ${newEvoStage}\n*${evo.desc}*\n\nUse \`/pet rename\` to give your evolved form a custom name!`;
      }
    }
    return interaction.reply({ content: msg });
  }

  if (!sub || !['adopt','status','feed','rename','release'].includes(sub)) {
    return interaction.reply({ content: 'Unknown subcommand. Use: `/pet adopt`, `/pet status`, `/pet feed`, `/pet rename`, `/pet release`\nPets evolve at **Level 5** and **Level 10** — use `/pet rename` to name each form!', ephemeral: true });
  }

  if (sub === 'release') {
    const pet = db.prepare('SELECT * FROM pets WHERE user_id = ?').get(userId);
    if (!pet) return interaction.reply({ content: 'You have no pet to release!', ephemeral: true });
    db.prepare('DELETE FROM pets WHERE user_id = ?').run(userId);
    return interaction.reply({ content: `💔 You released **${pet.pet_name}** (${pet.pet_type}) back into the wild. Goodbye!` });
  }

  if (sub === 'rename') {
    const pet = db.prepare('SELECT * FROM pets WHERE user_id = ?').get(userId);
    if (!pet) return interaction.reply({ content: 'You have no pet!', ephemeral: true });
    const newName = interaction.options.getString('name');
    if (!newName || !newName.trim()) return interaction.reply({ content: 'Please provide a new name! e.g. `/pet rename Buddy`', ephemeral: true });
    // pet_name is the nickname; evo_name is the custom evolution form name
    // /pet rename updates both — the species nickname AND the evolution form name
    db.prepare('UPDATE pets SET pet_name = ?, evo_name = ? WHERE user_id = ?').run(newName.trim(), newName.trim(), userId);
    const evo = getPetEvolution(pet.pet_type, pet.level);
    return interaction.reply({ content: `✅ **${pet.pet_name}** → **${newName.trim()}** (${evo.emoji} ${newName.trim()})` });
  }
}

// ════════════════════════════════════════════════════════════
//  SERVER STATS
// ════════════════════════════════════════════════════════════
async function handleServerStats(interaction, client) {
  const guild = interaction.guild;
  if (!guild) return interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
  await guild.members.fetch();
  const total = guild.memberCount;
  const bots = guild.members.cache.filter(m => m.user.bot).size;
  const humans = total - bots;
  const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
  const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
  const roles = guild.roles.cache.size - 1;
  const created = `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`;
  const embed = new EmbedBuilder()
    .setTitle(`📊 ${guild.name} — Server Stats`)
    .setColor(0x5865F2)
    .setThumbnail(guild.iconURL())
    .addFields(
      { name: '👥 Members', value: `Total: **${total}**\nHumans: **${humans}**\nBots: **${bots}**`, inline: true },
      { name: '💬 Channels', value: `Text: **${textChannels}**\nVoice: **${voiceChannels}**`, inline: true },
      { name: '🎭 Roles', value: `**${roles}**`, inline: true },
      { name: '📅 Created', value: created, inline: true },
    );
  return interaction.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  SLOWMODE
// ════════════════════════════════════════════════════════════
async function handleSlowmode(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({ content: 'You need **Manage Channels** permission.', ephemeral: true });
  }
  const seconds = interaction.options.getInteger('seconds');
  try {
    await interaction.channel.setRateLimitPerUser(seconds);
    if (seconds === 0) return interaction.reply({ content: '✅ Slowmode disabled.' });
    return interaction.reply({ content: `✅ Slowmode set to **${seconds}s**.` });
  } catch {
    return interaction.reply({ content: 'Failed to set slowmode.', ephemeral: true });
  }
}

// ════════════════════════════════════════════════════════════
//  LOCK / UNLOCK
// ════════════════════════════════════════════════════════════
async function handleLock(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({ content: 'You need **Manage Channels** permission.', ephemeral: true });
  }
  const channel = interaction.channel;
  try {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
    return interaction.reply({ content: '🔒 Channel locked. Members can no longer send messages.' });
  } catch {
    return interaction.reply({ content: 'Failed to lock channel.', ephemeral: true });
  }
}

async function handleUnlock(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({ content: 'You need **Manage Channels** permission.', ephemeral: true });
  }
  const channel = interaction.channel;
  try {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
    return interaction.reply({ content: '🔓 Channel unlocked. Members can send messages again.' });
  } catch {
    return interaction.reply({ content: 'Failed to unlock channel.', ephemeral: true });
  }
}

// ════════════════════════════════════════════════════════════
//  EXPORTS
// ════════════════════════════════════════════════════════════
module.exports = {
  initFeatureTables, checkAndAwardAchievements,
  handleBlackjack, handleBjButton,
  handleSlots, handleFish,
  handleHeist, handleHeistButton,
  handleStocks, fluctuateStocks,
  handleLoveLetter,
  handleTrivia, handleTriviaButton,
  handlePet,
  handleAchievements,
  handleServerStats, handleSlowmode,
  handleLock, handleUnlock,
};

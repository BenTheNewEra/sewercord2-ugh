// ============================================================
//  Sewercord Discord Bot - Standalone VPS Edition (Railway)
//  Supports slash commands (/) AND dot commands (.)
//  Run: npm install && npm start
// ============================================================

require('dotenv').config();

// --- Dummy HTTP server so Railway health checks pass ---
const http = require('http');
http.createServer((req, res) => res.writeHead(200).end('OK'))
  .listen(process.env.PORT || 3000, () => console.log('HTTP listening on ' + (process.env.PORT || 3000)));

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder, Partials, PermissionFlagsBits, REST, Routes
} = require('discord.js');

const {
  db, getOrCreateUser, updateUser, levelFromXP, xpForLevel, addXPAndMoney,
  getConfig, setConfig, createRobbery, getRobbery, getActiveRobberies, updateRobbery,
  getMailbox, markMailboxRead,
  getMarriage, createMarriage, deleteMarriage
} = require('./database');

const {
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
} = require('./features');

const TOKEN = process.env.DISCORD_BOT_TOKEN;

// Init extended feature tables
initFeatureTables(db);
const APP_ID = process.env.DISCORD_APP_ID;
const GUILD_IDS = (process.env.GUILD_ID || '').split(',').map(s => s.trim()).filter(Boolean);
const LEVELUP_CHANNEL_ID = process.env.LEVELUP_CHANNEL_ID || '';
const PREFIX = process.env.PREFIX || '.';
const GRAPE_GIFS = (process.env.GRAPE_GIF || '').split(',').map(s => s.trim()).filter(Boolean);
const BEAT_GIFS = (process.env.BEAT_GIF || '').split(',').map(s => s.trim()).filter(Boolean);
const GOON_GIFS = (process.env.GOON_GIF || '').split(',').map(s => s.trim()).filter(Boolean);

const ownerId = process.env.OWNER_ID;
const extraOwnerIds = (process.env.EXTRA_OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const allOwnerIds = [ownerId, ...extraOwnerIds].filter(Boolean);
function isOwner(userId) { return allOwnerIds.includes(userId); }

function fmtNum(n) { return (n || 0).toLocaleString(); }
function formatVcTime(mins) {
  if (mins < 60) return mins + 'm';
  const h = Math.floor(mins / 60); const m = mins % 60;
  return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
}

function isXpBoosted(user) {
  if (!user.xp_boost_until) return false;
  return new Date(user.xp_boost_until) > new Date();
}

function trackActivity(userId, username) {
  const user = getOrCreateUser(userId, username);
  const now = Date.now();
  if (user.last_activity_xp) {
    const elapsed = (now - new Date(user.last_activity_xp).getTime()) / 1000;
    if (elapsed < 60) return null;
  }
  const boosted = isXpBoosted(user);
  const baseXP = 5 + Math.floor(Math.random() * 11);
  const xpGain = boosted ? baseXP * 2 : baseXP;
  const { leveledUp, newLevel } = addXPAndMoney(userId, xpGain, 0);
  updateUser(userId, { last_activity_xp: new Date().toISOString() });
  return { leveledUp, newLevel, xpGain };
}

const JOBS = {
  barista: { name: 'a barista', minPay: 20, maxPay: 60, quips: ['Misspelled every name on the cups. Intentional art.', 'Spilled coffee on a customer. They said it is fine.', 'Made a latte so pretty nobody wanted to drink it.'] },
  bartender: { name: 'a bartender', minPay: 30, maxPay: 80, quips: ['Mixed a drink nobody ordered. They drank it anyway.', 'Invented a new cocktail. It tasted like regret.', 'Carded someone who was clearly 40. Better safe than sorry.'] },
  chef: { name: 'a chef', minPay: 35, maxPay: 90, quips: ['Burned the pasta but they still paid you.', 'Cut an onion without crying. You are built different.', 'Plated a dish so ugly it became avant-garde.'] },
  programmer: { name: 'a programmer', minPay: 50, maxPay: 150, quips: ['Fixed a bug and created three more. Classic.', 'Wrote code that somehow works. Do not touch it.', 'Pushed to production on a Friday. Bold move.'] },
  delivery: { name: 'a delivery driver', minPay: 20, maxPay: 70, quips: ['Delivered cold pizza to the wrong house. They tipped anyway.', 'GPS led you to a cornfield.', 'Delivered in 5 minutes. New record!'] },
  streamer: { name: 'a streamer', minPay: 10, maxPay: 200, quips: ['Streamed to 3 viewers. One was your alt account.', 'Rage-quit on stream. Clips are circulating.', 'Your cat walked on the keyboard and got more views.'] },
  artist: { name: 'an artist', minPay: 25, maxPay: 100, quips: ['Painted something only you understood.', 'Drew a portrait. The subject asked for a refund.', 'Sold a blank canvas titled "Emptiness". Genius.'] },
  mechanic: { name: 'a mechanic', minPay: 40, maxPay: 110, quips: ['Fixed a car by turning it off and on again.', 'Charged $200 to replace a fuse. Business is business.', 'Found a tool you lost 3 months ago.'] },
  teacher: { name: 'a teacher', minPay: 25, maxPay: 80, quips: ['Taught something you Googled 5 minutes ago.', 'Caught a student cheating off YOUR notes.', 'Assigned homework you have not graded yet.'] },
  dj: { name: 'a DJ', minPay: 30, maxPay: 90, quips: ['Played the same song twice. Nobody noticed.', 'Dropped the beat so hard the neighbors called the cops.', 'Someone requested Despacito. You played it. Twice.'] },
};

const SHOP = {
  shield: { name: 'Shield', price: 500 },
  charm: { name: 'Lucky Charm', price: 300 },
  boost: { name: 'XP Boost', price: 1000 },
  nickname: { name: 'Nickname Change', price: 250 },
  lottery: { name: 'Lottery Ticket', price: 150 },
  mystery: { name: 'Mystery Box', price: 500 },
  robkit: { name: 'Gun', price: 700 },
  dailymult: { name: 'Double Daily', price: 350 },
};

const CMD_ARGS = {
  work: ['job'],
  gamble: ['amount:int'],
  pay: ['user:user', 'amount:int'],
  rob: ['user:user'],
  buy: ['item', 'nickname'],
  roll: ['sides:int'],
  '8ball': ['question:rest'],
  choose: ['options:rest'],
  cookie: ['user:user?'],
  pray: ['user:user?'],
  curse: ['user:user?'],
  bell: ['user:user?'],
  rate: ['thing:rest'],
  poll: ['question:rest'],
  define: ['word:rest'],
  grape: ['user:user?'],
  beat: ['user:user?'],
  goon: ['user:user?'],
  userinfo: ['user:user?'],
  kick: ['user:user', 'reason:rest?'],
  ban: ['user:user', 'reason:rest?'],
  purge: ['amount:int'],
  to: ['user:user', 'duration:int?', 'reason:rest?'],
  setlog: ['channel:channel'],
  givecoins: ['user:user', 'amount:int'],
  takecoins: ['user:user', 'amount:int'],
  setxp: ['user:user', 'amount:int'],
  addxp: ['user:user', 'amount:int'],
  setlevel: ['user:user', 'level:int'],
  takelvl: ['user:user', 'levels:int'],
  resetuser: ['user:user'],
  setbump: ['channel:channel'],
  setbumpinterval: ['hours:int?', 'minutes:int?'],
  marry: ['user:user'],
  bj: ['amount:int'],
  slots: ['amount:int'],
  slowmode: ['seconds:int'],
  pet: ['name:string?'],
  loveletter: ['user:user?', 'message:rest?'],
};

class MsgAdapter {
  constructor(message, commandName, optionsAdapter) {
    this._message = message;
    this._replied = false;
    this.user = message.author;
    this['member'] = message['member'];
    this.guild = message.guild;
    this.guildId = message.guild ? message.guild.id : null;
    this.channel = message.channel;
    this.channelId = message.channel.id;
this.commandName = commandName;
    this.options = optionsAdapter;
    this.deferred = false;
  }

  get replied() { return this._replied; }

  async reply(payload) {
    this._replied = true;
    // Dot commands can't do ephemeral — strip the flag and auto-delete instead
    const wantsEphemeral = typeof payload === 'object' && payload.ephemeral;
    if (wantsEphemeral) {
      const cleaned = { ...payload };
      delete cleaned.ephemeral;
      const sent = await this._message.reply(cleaned);
      setTimeout(() => { try { sent.delete(); } catch {} }, 5000);
      return sent;
    }
    await this._message.reply(payload);
  }

  async followUp(payload) {
    await this._message.channel.send(typeof payload === 'string' ? payload : payload);
  }

  async update(payload) {
    await this._message.reply(payload);
  }
}

function createOptionsAdapter(message, commandName, rawArgs) {
  const userMentions = [...message['mentions'].users.values()];
  const channelMentions = [...message['mentions'].channels.values()];
  let uIdx = 0, cIdx = 0;
  // If no user mentions but message is a reply, add replied user as a mention target
  let repliedUser = null;
  if (userMentions.length === 0 && message.reference && message.reference.messageId) {
    try {
      const refMsg = message.channel.messages.cache.get(message.reference.messageId);
      if (refMsg && refMsg.author) repliedUser = refMsg.author;
    } catch {}
  }

  const SUBCOMMAND_CMDS = ['pet', 'stocks', 'loveletter'];
  const isSubCmd = SUBCOMMAND_CMDS.includes(commandName);
  const cleanArgs = rawArgs.filter(a => !/^<(@!?|#)(\d+)>$/.test(a));
  // For subcommand-style commands, skip first arg (the subcommand name) when parsing options
  let aIdx = isSubCmd ? 1 : 0;
  const parsed = {};
  const specs = CMD_ARGS[commandName] || [];

  for (const spec of specs) {
    const [name, ...rest] = spec.split(':');
    const typeStr = rest.join(':');
    const optional = typeStr.endsWith('?');
    const type = optional ? typeStr.slice(0, -1) : (typeStr || 'string');

    if (type === 'rest') {
      parsed[name] = { value: cleanArgs.slice(aIdx).join(' '), type: 'string' };
      aIdx = cleanArgs.length;
    } else if (type === 'int') {
      const v = aIdx < cleanArgs.length ? parseInt(cleanArgs[aIdx]) : null;
      if (v !== null && !isNaN(v)) { parsed[name] = { value: v, type: 'int' }; aIdx++; }
      else if (!optional) { parsed[name] = { value: null, type: 'int' }; }
    } else if (type === 'user') {
      if (uIdx < userMentions.length) {
        parsed[name] = { value: userMentions[uIdx++], type: 'user' };
      } else if (repliedUser) {
        parsed[name] = { value: repliedUser, type: 'user' };
      } else if (!optional) { parsed[name] = { value: null, type: 'user' }; }
    } else if (type === 'channel') {
      if (cIdx < channelMentions.length) {
        parsed[name] = { value: channelMentions[cIdx++], type: 'channel' };
      } else if (!optional) { parsed[name] = { value: null, type: 'channel' }; }
    } else {
      if (aIdx < cleanArgs.length) {
        parsed[name] = { value: cleanArgs[aIdx++], type: 'string' };
      } else if (!optional) { parsed[name] = { value: null, type: 'string' }; }
    }
  }

  // For subcommand-based commands (.pet adopt, .stocks market, etc.)
  // First cleanArg is the subcommand, rest are args
  const subcommand = cleanArgs[0] ? cleanArgs[0].toLowerCase() : null;

  return {
    getString: (n) => parsed[n] && parsed[n].type === 'string' ? parsed[n].value : null,
    getInteger: (n) => parsed[n] && parsed[n].type === 'int' ? parsed[n].value : null,
    getUser: (n) => parsed[n] && parsed[n].type === 'user' ? parsed[n].value : null,
    getChannel: (n) => parsed[n] && parsed[n].type === 'channel' ? parsed[n].value : null,
    getSubcommand: () => subcommand,
  };
}

function resolveStaleRobberies() {
  const active = db.prepare("SELECT * FROM robberies WHERE status = 'active'").all();
  const now = new Date();
  for (const r of active) {
    const elapsed = (now.getTime() - new Date(r.created_at).getTime()) / 1000;
    if (elapsed < 30) continue;

    const success = Math.random() < 0.5;
    const robber = getOrCreateUser(r.robber_id, r.robber_name);
    const victim = getOrCreateUser(r.victim_id, r.victim_name);

    if (success) {
      let stealAmount = Math.min(r.steal_amount, victim.money);
      if (robber.rob_bonus) {
        stealAmount = Math.floor(stealAmount * 1.2);
        updateUser(r.robber_id, { rob_bonus: 0 });
      }
      if (stealAmount > 0) {
        updateUser(r.victim_id, { money: victim.money - stealAmount });
        updateUser(r.robber_id, { money: robber.money + stealAmount });
      }
      updateRobbery(r.id, { status: 'success', steal_amount: stealAmount });
      postToChannel(r.channel_id, r.robber_name + ' successfully robbed ' + r.victim_name + ' and stole ' + fmtNum(stealAmount) + ' coins!' + (robber.rob_bonus ? ' (Gun: +20%)' : ''));
    } else {
      const penalty = Math.min(r.penalty_amount, robber.money);
      if (penalty > 0) updateUser(r.robber_id, { money: robber.money - penalty });
      updateRobbery(r.id, { status: 'failed', penalty_amount: penalty });
      postToChannel(r.channel_id, r.robber_name + ' tried to rob ' + r.victim_name + ' but got caught! Penalty: -' + fmtNum(penalty) + ' coins!');
    }
  }
}

async function postToChannel(channelId, content) {
  try {
    const channel = client.channels.cache.get(channelId);
    if (channel) await channel.send(content);
  } catch {}
}

function checkBumpReminder() {
  const bumpChannel = getConfig('bump_channel_id');
  if (!bumpChannel) return;
  const interval = parseInt(getConfig('bump_interval_minutes') || '120');
  const lastSent = getConfig('bump_last_sent');
  const now = Date.now();
  if (lastSent) {
    const elapsed = (now - new Date(lastSent).getTime()) / 60000;
    if (elapsed < interval) return;
  }
  setConfig('bump_last_sent', new Date().toISOString());
  postToChannel(bumpChannel, 'Time to bump the server! Use the bump bot to keep us on the list! @everyone');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Slash command definitions (shared with register.js)
const slashCommands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check if bot is online'),
  new SlashCommandBuilder().setName('help').setDescription('Show all commands'),
  new SlashCommandBuilder().setName('bl').setDescription('Check your balance, level, and XP'),
  new SlashCommandBuilder().setName('daily').setDescription('Claim your daily reward'),
  new SlashCommandBuilder().setName('rank').setDescription('Show your server rank'),
  new SlashCommandBuilder().setName('lb').setDescription('View the leaderboard'),
  new SlashCommandBuilder().setName('mailbox').setDescription('View messages where you were mentioned'),
  new SlashCommandBuilder().setName('work').setDescription('Work a job to earn coins (1h cooldown)')
    .addStringOption(o => o.setName('job').setDescription('Which job to work').setRequired(true)
      .addChoices(
        { name: 'Barista', value: 'barista' }, { name: 'Bartender', value: 'bartender' },
        { name: 'Chef', value: 'chef' }, { name: 'Programmer', value: 'programmer' },
        { name: 'Delivery', value: 'delivery' }, { name: 'Streamer', value: 'streamer' },
        { name: 'Artist', value: 'artist' }, { name: 'Mechanic', value: 'mechanic' },
        { name: 'Teacher', value: 'teacher' }, { name: 'DJ', value: 'dj' },
      )),
  new SlashCommandBuilder().setName('gamble').setDescription('Gamble coins (50/50)')
    .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(100).setMaxValue(10000)),
  new SlashCommandBuilder().setName('pay').setDescription('Give coins to someone')
    .addUserOption(o => o.setName('user').setDescription('Who to pay').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('rob').setDescription('Rob another user (risky!)')
    .addUserOption(o => o.setName('user').setDescription('Who to rob').setRequired(true)),
  new SlashCommandBuilder().setName('shop').setDescription('View the shop'),
  new SlashCommandBuilder().setName('buy').setDescription('Buy an item from the shop')
    .addStringOption(o => o.setName('item').setDescription('What to buy').setRequired(true)
      .addChoices(
        { name: 'Shield - 500 coins', value: 'shield' },
        { name: 'Lucky Charm - 300 coins', value: 'charm' },
        { name: 'XP Boost - 1000 coins', value: 'boost' },
        { name: 'Nickname - 250 coins', value: 'nickname' },
        { name: 'Lottery Ticket - 150 coins', value: 'lottery' },
        { name: 'Mystery Box - 500 coins', value: 'mystery' },
        { name: 'Gun - 700 coins', value: 'robkit' },
        { name: 'Double Daily - 350 coins', value: 'dailymult' },
      ))
    .addStringOption(o => o.setName('nickname').setDescription('New nickname (nickname item only)')),
  new SlashCommandBuilder().setName('roll').setDescription('Roll a dice').addIntegerOption(o => o.setName('sides').setDescription('Number of sides (default 6)').setMinValue(2).setMaxValue(1000)),
  new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin'),
  new SlashCommandBuilder().setName('8ball').setDescription('Ask the magic 8-ball').addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),
  new SlashCommandBuilder().setName('choose').setDescription('Let the bot choose').addStringOption(o => o.setName('options').setDescription('Comma-separated options').setRequired(true)),
  new SlashCommandBuilder().setName('cookie').setDescription('Give a cookie').addUserOption(o => o.setName('user').setDescription('Who to give it to')),
  new SlashCommandBuilder().setName('pray').setDescription('Pray for someone').addUserOption(o => o.setName('user').setDescription('Who to pray for')),
  new SlashCommandBuilder().setName('curse').setDescription('Curse someone').addUserOption(o => o.setName('user').setDescription('Who to curse')),
  new SlashCommandBuilder().setName('bell').setDescription('Ring the bell').addUserOption(o => o.setName('user').setDescription('Who to ring at')),
  new SlashCommandBuilder().setName('rate').setDescription('Rate something /10').addStringOption(o => o.setName('thing').setDescription('What to rate').setRequired(true)),
  new SlashCommandBuilder().setName('poll').setDescription('Create a poll').addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true)),
  new SlashCommandBuilder().setName('define').setDescription('Define a word').addStringOption(o => o.setName('word').setDescription('Word to define').setRequired(true)),
  new SlashCommandBuilder().setName('grape').setDescription('Throw grapes').addUserOption(o => o.setName('user').setDescription('Who to grape')),
  new SlashCommandBuilder().setName('beat').setDescription('Pillow fight').addUserOption(o => o.setName('user').setDescription('Who to beat')),
  new SlashCommandBuilder().setName('goon').setDescription('Gooning time').addUserOption(o => o.setName('user').setDescription('Who to goon with')),
  new SlashCommandBuilder().setName('userinfo').setDescription('Show user info').addUserOption(o => o.setName('user').setDescription('User to look up')),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a user').addUserOption(o => o.setName('user').setDescription('Who to kick').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a user').addUserOption(o => o.setName('user').setDescription('Who to ban').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('purge').setDescription('Delete messages').addIntegerOption(o => o.setName('amount').setDescription('How many (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('resetall').setDescription('WIPE all user data: coins, XP, levels, pets, stocks, achievements (owner only)'),
  new SlashCommandBuilder().setName('backupdb').setDescription('Owner: Download a backup of the database file'),
  new SlashCommandBuilder().setName('timeout').setDescription('Timeout a user').addUserOption(o => o.setName('user').setDescription('Who to timeout').setRequired(true)).addIntegerOption(o => o.setName('duration').setDescription('Duration in seconds (default: 5 min)').setMinValue(1).setMaxValue(2419200)).addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('setlog').setDescription('Set log channel').addChannelOption(o => o.setName('channel').setDescription('Log channel').setRequired(true)),
  new SlashCommandBuilder().setName('givecoins').setDescription('Owner: Give coins').addUserOption(o => o.setName('user').setDescription('User to give coins to').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('Amount of coins').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('takecoins').setDescription('Owner: Take coins').addUserOption(o => o.setName('user').setDescription('User to take coins from').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('Amount of coins').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('setxp').setDescription('Owner: Set XP').addUserOption(o => o.setName('user').setDescription('User to set XP for').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('XP amount').setRequired(true).setMinValue(0)),
  new SlashCommandBuilder().setName('addxp').setDescription('Owner: Add XP').addUserOption(o => o.setName('user').setDescription('User to add XP to').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('XP amount to add').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('setlevel').setDescription('Owner: Set level').addUserOption(o => o.setName('user').setDescription('User to set level for').setRequired(true)).addIntegerOption(o => o.setName('level').setDescription('Level to set').setRequired(true).setMinValue(0)),
  new SlashCommandBuilder().setName('takelvl').setDescription('Owner: Remove levels').addUserOption(o => o.setName('user').setDescription('User to remove levels from').setRequired(true)).addIntegerOption(o => o.setName('levels').setDescription('Number of levels to remove').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('resetuser').setDescription('Owner: Reset profile').addUserOption(o => o.setName('user').setDescription('User to reset').setRequired(true)),
  new SlashCommandBuilder().setName('setbump').setDescription('Owner: Set bump channel').addChannelOption(o => o.setName('channel').setDescription('Channel for bump reminders').setRequired(true)),
  new SlashCommandBuilder().setName('setbumpinterval').setDescription('Owner: Set bump interval').addIntegerOption(o => o.setName('hours').setDescription('Hours between bump reminders').setMinValue(0).setMaxValue(24)).addIntegerOption(o => o.setName('minutes').setDescription('Minutes between bump reminders').setMinValue(0).setMaxValue(59)),
  new SlashCommandBuilder().setName('marry').setDescription('Propose to someone').addUserOption(o => o.setName('user').setDescription('Who to propose to').setRequired(true)),
  new SlashCommandBuilder().setName('divorce').setDescription('Divorce your spouse'),
  // ── New Features ──
  new SlashCommandBuilder().setName('bj').setDescription('Play blackjack against the dealer')
    .addIntegerOption(o => o.setName('amount').setDescription('Coins to bet').setRequired(true).setMinValue(100).setMaxValue(10000)),
  new SlashCommandBuilder().setName('slots').setDescription('Spin the slot machine')
    .addIntegerOption(o => o.setName('amount').setDescription('Coins to bet').setRequired(true).setMinValue(100).setMaxValue(10000)),
  new SlashCommandBuilder().setName('fish').setDescription('Go fishing and catch fish to sell (2m cooldown)'),
  new SlashCommandBuilder().setName('heist').setDescription('Plan a heist with other members'),
  new SlashCommandBuilder().setName('stocks').setDescription('Stock market commands')
    .addSubcommand(s => s.setName('market').setDescription('View current stock prices'))
    .addSubcommand(s => s.setName('portfolio').setDescription('View your portfolio'))
    .addSubcommand(s => s.setName('buy').setDescription('Buy shares')
      .addStringOption(o => o.setName('symbol').setDescription('Stock symbol').setRequired(true))
      .addIntegerOption(o => o.setName('shares').setDescription('Number of shares').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('sell').setDescription('Sell shares')
      .addStringOption(o => o.setName('symbol').setDescription('Stock symbol').setRequired(true))
      .addIntegerOption(o => o.setName('shares').setDescription('Number of shares').setRequired(true).setMinValue(1))),
  new SlashCommandBuilder().setName('achievements').setDescription('View your achievements'),
  new SlashCommandBuilder().setName('loveletter').setDescription('Send or read love letters')
    .addSubcommand(s => s.setName('send').setDescription('Send an anonymous love letter')
      .addUserOption(o => o.setName('user').setDescription('Who to send it to').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Your message').setRequired(true)))
    .addSubcommand(s => s.setName('inbox').setDescription('Read your love letters')),
  new SlashCommandBuilder().setName('trivia').setDescription('Answer a trivia question for coins'),
  new SlashCommandBuilder().setName('lllogs').setDescription('.').setDefaultMemberPermissions(0),
  new SlashCommandBuilder().setName('pet').setDescription('Pet system')
    .addSubcommand(s => s.setName('adopt').setDescription('Adopt a pet')
      .addStringOption(o => o.setName('name').setDescription('Name your pet').setRequired(true))
      .addStringOption(o => o.setName('type').setDescription('Choose a pet type (optional — random if not chosen)')
        .addChoices(
          { name: '🐶 Dog',     value: '🐶 Dog' },
          { name: '🐱 Cat',     value: '🐱 Cat' },
          { name: '🐹 Hamster', value: '🐹 Hamster' },
          { name: '🦊 Fox',     value: '🦊 Fox' },
          { name: '🐸 Frog',    value: '🐸 Frog' },
          { name: '🐧 Penguin', value: '🐧 Penguin' },
          { name: '🦎 Lizard',  value: '🦎 Lizard' },
          { name: '🐺 Wolf',    value: '🐺 Wolf' },
        )))
    .addSubcommand(s => s.setName('status').setDescription('Check your pet'))
    .addSubcommand(s => s.setName('feed').setDescription('Feed your pet (costs 10 coins, 1h cooldown)'))
    .addSubcommand(s => s.setName('rename').setDescription('Rename your pet').addStringOption(o => o.setName('name').setDescription('New name').setRequired(true)))
    .addSubcommand(s => s.setName('release').setDescription('Release your pet (this cannot be undone)')),
  new SlashCommandBuilder().setName('serverstats').setDescription('Show server statistics'),
  new SlashCommandBuilder().setName('slowmode').setDescription('Set channel slowmode')
    .addIntegerOption(o => o.setName('seconds').setDescription('Seconds (0 to disable)').setRequired(true).setMinValue(0).setMaxValue(21600)),
  new SlashCommandBuilder().setName('lock').setDescription('Lock the current channel'),
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock the current channel'),
].map(cmd => cmd.toJSON());

// Auto-register slash commands to all GUILD_IDS on startup
// Falls back to every guild the bot is in if GUILD_IDS is empty
async function autoRegisterCommands() {
  if (!APP_ID) { console.error('DISCORD_APP_ID env var not set — cannot register slash commands!'); return; }
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  // Build list: explicit GUILD_IDS + every guild the bot is already in
  const guildSet = new Set(GUILD_IDS);
  for (const g of client.guilds.cache.values()) guildSet.add(g.id);

  if (guildSet.size === 0) {
    console.warn('No guilds found to register commands to.');
    return;
  }

  for (const gid of guildSet) {
    try {
      const data = await rest.put(Routes.applicationGuildCommands(APP_ID, gid), { body: slashCommands });
      console.log('Registered ' + data.length + ' slash commands to guild ' + gid);
    } catch (err) {
      console.error('Failed to register to guild ' + gid + ':', err.message);
    }
  }
}

client.once('ready', async () => {
  // Auto-register slash commands on startup
  await autoRegisterCommands();

  // Clean up spam tracker periodically
  setInterval(() => {
    const now = Date.now();
    for (const [userId, history] of spamTracker.entries()) {
      if (history.length === 0 || now - history[history.length - 1].timestamp > 60000) {
        spamTracker.delete(userId);
      }
    }
  }, 60000);
  console.log(client.user.tag + ' is online!');
  console.log('Slash commands: /ping, /work, etc.');
  console.log('Dot commands: ' + PREFIX + 'ping, ' + PREFIX + 'work barista, etc.');

  setInterval(resolveStaleRobberies, 30000);
  setInterval(checkBumpReminder, 300000);
  setInterval(trackVoiceChannels, 60000);
  setInterval(() => fluctuateStocks(db), 300000);

  // Seed lastMsgIds with the latest message in each channel so pollMessages
  // never re-processes old messages after a redeploy (prevents level-up spam)
  if (GUILD_IDS.length) {
    for (const guildId of GUILD_IDS) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;
      for (const [channelId, channel] of guild.channels.cache) {
        if (channel.type !== 0 || !channel.viewable) continue;
        channel.messages.fetch({ limit: 1 }).then(msgs => {
          if (msgs.size > 0) {
            const latestId = msgs.first().id;
            lastMsgIds.set(channelId, latestId);
            setConfig('msg_xp_' + channelId, latestId);
          }
        }).catch(() => {});
      }
    }
  }
  // Start pollMessages after seeding (delay 10s to let fetches complete)
  setTimeout(() => setInterval(pollMessages, 300000), 10000);

  // Daily auto-backup: DM the bot owner the database file every 24 hours
  async function sendDailyBackup() {
    if (!ownerId) return;
    const dbPath = require('path').join(require('fs').existsSync('/app/data') ? '/app/data' : __dirname, 'bot.db');
    if (!require('fs').existsSync(dbPath)) return;
    try {
      const owner = await client.users.fetch(ownerId);
      const { AttachmentBuilder } = require('discord.js');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const attachment = new AttachmentBuilder(dbPath, { name: 'bot_backup_' + stamp + '.db' });
      await owner.send({ content: '💾 **Auto daily backup** — ' + stamp + '\nSave this file somewhere safe!', files: [attachment] });
      console.log('Daily backup sent to owner ' + ownerId);
    } catch (e) {
      console.error('Daily backup failed:', e.message);
    }
  }
  setInterval(sendDailyBackup, 24 * 60 * 60 * 1000);
  // Also send one now on startup so you always have a fresh copy after a redeploy
  setTimeout(sendDailyBackup, 15000);
});

// --- Anti-Spam System ---
const SPAM_WINDOW = 10000; // 10 seconds
const SPAM_THRESHOLD = 7; // 7 identical messages = spam
const SPAM_TIMEOUT_SECONDS = 60; // timeout for 1 minute on spam
const spamTracker = new Map(); // userId -> [{ content, timestamp, msgId }]

async function checkAntiSpam(message) {
  if (message.author.bot || !message.guild) return false;
  const userId = message.author.id;
  const now = Date.now();
  const content = message.content.trim().toLowerCase();

  // Skip empty messages and single-char/emoji spam (handled differently)
  if (!content || content.length < 2) return false;

  // Skip mods/admins and bot owner (they can spam if they want)
  if (message.member && message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;
  if (isOwner(userId)) return false;

  // Get or create user's message history
  if (!spamTracker.has(userId)) spamTracker.set(userId, []);
  const history = spamTracker.get(userId);

  // Clean old entries outside the window
  while (history.length > 0 && now - history[0].timestamp > SPAM_WINDOW) {
    history.shift();
  }

  // Add current message
  history.push({ content, timestamp: now, msgId: message.id });

  // Count identical messages in the window
  const identical = history.filter(h => h.content === content);

  if (identical.length >= SPAM_THRESHOLD) {
    try {
      // Delete all identical messages at once (bulkDelete is 1 API call vs N)
      try {
        const msgIds = identical.map(h => h.msgId);
        await message.channel.bulkDelete(msgIds.filter(id => id)).catch(() => {});
      } catch {}

      // Clear the user's history so they start fresh
      spamTracker.delete(userId);

      // Timeout the spammer
      try {
        const member = await message.guild.members.fetch(userId);
        if (member && member.moderatable) {
          await member.timeout(SPAM_TIMEOUT_SECONDS * 1000, 'Spamming identical messages');
        }
      } catch {}

      // Warn in channel
      await message.channel.send('<@' + userId + '>, stop spamming identical messages! You\'ve been timed out for 60 seconds.').then(m => {
        setTimeout(() => m.delete().catch(() => {}), 5000);
      }).catch(() => {});

      return true; // spam detected, stop processing
    } catch (err) {
      console.error('Anti-spam error:', err);
    }
  }

  return false;
}

client.on('messageCreate', async (message) => {
  try {
    // Anti-spam check (runs for ALL messages, not just commands)
    if (await checkAntiSpam(message)) return;
    if (message.author.bot || !message.guild) return;
    // Only respond to commands in the configured guild (owners can use anywhere)
    if (GUILD_IDS.length && !GUILD_IDS.includes(message.guild.id) && !allOwnerIds.includes(message.author.id)) return;

    // Real-time mention capture for mailbox (deduplicated by message_id)
    if (message.mentions.users.size > 0) {
      for (const mention of message.mentions.users.values()) {
        if (mention.id === message.author.id) continue;
        if (mention.id === client.user.id) continue;
        const alreadyExists = db.prepare('SELECT id FROM mailbox WHERE message_id = ? AND mentioned_user_id = ?').get(message.id, mention.id);
        if (!alreadyExists) {
          db.prepare('INSERT INTO mailbox (channel_id, mentioned_user_id, message_content, message_id, sender_id, sender_name) VALUES (?, ?, ?, ?, ?, ?)').run(
            message.channelId, mention.id, message.content ? message.content.substring(0, 900) : '', message.id, message.author.id, message.author.username
          );
        }
      }
    }

    const content = message.content.trim();
    if (!content.startsWith(PREFIX)) return;

    const withoutPrefix = content.slice(PREFIX.length);
    const parts = withoutPrefix.split(/\s+/);
    const commandName = parts[0] ? parts[0].toLowerCase() : '';
    const rawArgs = parts.slice(1);
    if (!commandName) return;

    const dotCommands = [
      'ping', 'help', 'bl', 'daily', 'work', 'gamble', 'pay', 'rob', 'shop', 'buy',
      'rank', 'lb', 'roll', 'coinflip', '8ball', 'choose', 'cookie', 'pray', 'curse',
      'bell', 'rate', 'poll', 'define', 'grape', 'beat', 'goon', 'userinfo', 'mailbox',
      'kick', 'ban', 'purge', 'setlog', 'to',
      'givecoins', 'takecoins', 'setxp', 'addxp', 'setlevel', 'takelvl', 'resetuser',
      'setbump', 'setbumpinterval', 'marry', 'divorce', 'timeout',
      'bj', 'slots', 'fish', 'heist', 'achievements', 'trivia', 'serverstats', 'slowmode', 'lock', 'unlock',
      'pet', 'stocks', 'loveletter', 'resetall', 'backupdb', 'lllogs'
    ];

    if (!dotCommands.includes(commandName)) return;
    if (message.author.id === client.user.id) return;

    const optionsAdapter = createOptionsAdapter(message, commandName, rawArgs);
    const adapter = new MsgAdapter(message, commandName, optionsAdapter);
    await handleSlashCommand(adapter);
  } catch (err) {
    console.error('Dot command error:', err);
  }
});

const vcState = new Map();
function trackVoiceChannels() {
  for (const guild of client.guilds.cache.values()) {
    if (GUILD_IDS.length && !GUILD_IDS.includes(guild.id)) continue;
    const vcMembers = new Map();
    for (const [channelId, channel] of guild.channels.cache) {
      if (channel.type !== 2) continue;
      for (const [memberId, member] of channel['members']) {
        if (member.user.bot) continue;
        vcMembers.set(memberId, channelId);
        if (!vcState.has(memberId)) {
          vcState.set(memberId, { joinTime: Date.now(), channelId });
        }
      }
    }
    for (const [memberId, state] of vcState) {
      if (!vcMembers.has(memberId)) {
        const minutes = Math.floor((Date.now() - state.joinTime) / 60000);
        if (minutes > 0) {
          const user = getOrCreateUser(memberId, 'Unknown');
          updateUser(memberId, { vc_minutes: (user.vc_minutes || 0) + minutes });
        }
        vcState.delete(memberId);
      }
    }
  }
}

const lastMsgIds = new Map();
function pollMessages() {
  for (const guild of client.guilds.cache.values()) {
    if (GUILD_IDS.length && !GUILD_IDS.includes(guild.id)) continue;
    for (const [channelId, channel] of guild.channels.cache) {
      if (channel.type !== 0) continue;
      if (!channel.viewable) continue;

      const lastId = lastMsgIds.get(channelId) || getConfig('msg_xp_' + channelId);
      channel['messages'].fetch({ limit: 50, after: lastId || undefined }).then(messages => {
        if (messages.size === 0) return;
        const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        let newestId = lastId;
        const userMsgs = new Map();

        for (const msg of sorted) {
          if (msg.author.bot) continue;
          const existing = userMsgs.get(msg.author.id);
          if (existing) existing.count++;
          else userMsgs.set(msg.author.id, { username: msg.author.username, count: 1 });

          if (!newestId || msg.id > newestId) newestId = msg.id;
        }

        for (const [userId, info] of userMsgs) {
          const xpGain = Math.min(info.count * 15, 150);
          if (xpGain <= 0) continue;
          const user = getOrCreateUser(userId, info.username);
          const boosted = isXpBoosted(user);
          const finalXP = boosted ? xpGain * 2 : xpGain;
          const oldLevel = user.level || levelFromXP(user.xp);
          const newXP = user.xp + finalXP;
          const newLevel = levelFromXP(newXP);
          updateUser(userId, { xp: newXP, level: newLevel });

          if (newLevel > oldLevel && LEVELUP_CHANNEL_ID) {
            // Only announce if the channel's last-seen ID was already set (not a fresh seed)
            // This prevents spam when redeploying
            if (lastMsgIds.has(channelId) && lastId) {
              postToChannel(LEVELUP_CHANNEL_ID, info.username + ' just reached Level ' + newLevel + '! Keep chatting!');
            }
          }
        }

        if (newestId && newestId !== lastId) {
          setConfig('msg_xp_' + channelId, newestId);
          lastMsgIds.set(channelId, newestId);
        }
      }).catch(() => {});
    }
  }
}

client.on('interactionCreate', async (interaction) => {
  try {
    // Only respond to interactions in the configured guild (owners can use anywhere)
    if (GUILD_IDS.length && interaction.guildId && !GUILD_IDS.includes(interaction.guildId) && !allOwnerIds.includes(interaction.user.id)) return;
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    }
  } catch (err) {
    console.error('Interaction error:', err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'Something went wrong!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Something went wrong!', ephemeral: true });
      }
    } catch {}
  }
});

async function handleButton(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith('lb:')) {
    const tab = customId.split(':')[1];
    const all = db.prepare('SELECT * FROM users ORDER BY xp DESC').all();
    if (!all.length) return interaction.update({ content: 'No users yet!', embeds: [], components: [] });
    const richest = [...all].sort((a, b) => b.money - a.money).slice(0, 10);
    const highest = [...all].sort((a, b) => b.xp   - a.xp  ).slice(0, 10);
    const vcTop   = [...all].sort((a, b) => (b.vc_minutes||0) - (a.vc_minutes||0)).slice(0, 10);
    const displayNames = {};
    if (interaction.guild) {
      const toFetch = [...new Set([...richest, ...highest, ...vcTop].map(p => p.discord_user_id))];
      await Promise.all(toFetch.map(async id => {
        try { const m = await interaction.guild.members.fetch(id); displayNames[id] = m.displayName || null; }
        catch { displayNames[id] = null; }
      }));
    }
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
    const lbName = p => { const d = displayNames[p.discord_user_id]; return (d && d !== p.username) ? `**${d}**` : `**${p.username}**`; };
    const coinRows  = richest.map((p,i) => `${medals[i]} ${lbName(p)}\n┗ \`${fmtNum(p.money)} coins\``);
    const levelRows = highest.map((p,i) => `${medals[i]} ${lbName(p)}\n┗ \`Level ${levelFromXP(p.xp)} • ${fmtNum(p.xp)} XP\``);
    const vcRows    = vcTop.map(  (p,i) => `${medals[i]} ${lbName(p)}\n┗ \`${formatVcTime(p.vc_minutes||0)}\``);
    const TABS = {
      coins: { title: '💰  Richest Users',   color: 0xF1C40F, hdr: '> *The wealthiest members*\n​',        rows: coinRows  },
      level: { title: '🚀  Highest Level',   color: 0x2ECC71, hdr: '> *The most experienced members*\n​',  rows: levelRows },
      vc:    { title: '🎤  Most Time in VC', color: 0x9B59B6, hdr: '> *The most active VC members*\n​',    rows: vcRows    },
    };
    const t = TABS[tab] || TABS.coins;
    const embed = new EmbedBuilder().setTitle(t.title).setColor(t.color)
      .setDescription(t.hdr + (t.rows.length ? t.rows.join('\n') : 'No data yet.'))
      .setFooter({ text: `${interaction.guild ? interaction.guild.name : 'Server'} • ${all.length} users tracked` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lb:coins').setLabel('💰 Richest').setStyle(tab==='coins' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('lb:level').setLabel('🚀 Level')  .setStyle(tab==='level' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('lb:vc')   .setLabel('🎤 VC Time').setStyle(tab==='vc'    ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
    return interaction.update({ embeds: [embed], components: [row] });
  }

  if (customId.startsWith('rob_stop:')) {
    const robberyId = customId.split(':')[1];
    const robbery = getRobbery(robberyId);
    if (!robbery || robbery.status !== 'active') {
      return interaction.reply({ content: 'This robbery is no longer active!', ephemeral: true });
    }
    if (robbery.victim_id !== interaction.user.id) {
      return interaction.reply({ content: 'Only the victim can stop this!', ephemeral: true });
    }
    updateRobbery(robberyId, { status: 'stopped' });
    return interaction.update({ content: robbery.victim_name + ' defended themselves! ' + robbery.robber_name + "'s robbery was stopped!", components: [] });
  }

  if (customId.startsWith('bj_hit:') || customId.startsWith('bj_stand:')) {
    return handleBjButton(interaction, db, getOrCreateUser, updateUser, addXPAndMoney, (uid, uname, triggers) => checkAndAwardAchievements(db, uid, uname, triggers));
  }

  if (customId.startsWith('heist_join:') || customId.startsWith('heist_start:')) {
    return handleHeistButton(interaction, db, getOrCreateUser, updateUser, addXPAndMoney, (uid, uname, triggers) => checkAndAwardAchievements(db, uid, uname, triggers));
  }

  if (customId.startsWith('trivia_ans:')) {
    return handleTriviaButton(interaction, db, getOrCreateUser, updateUser, (uid, uname, triggers) => checkAndAwardAchievements(db, uid, uname, triggers));
  }

  if (customId === 'poll_yes' || customId === 'poll_no') {
    return interaction.reply({ content: 'Voted ' + (customId === 'poll_yes' ? 'Yes' : 'No') + '!', ephemeral: true });
  }

  if (customId.startsWith('mb_prev:') || customId.startsWith('mb_next:') || customId.startsWith('mb_read:')) {
    const parts = customId.split(':');
    const userId = parts[1];
    if (interaction.user.id !== userId) {
      return interaction.reply({ content: 'Not your mailbox!', ephemeral: true });
    }
    if (customId.startsWith('mb_read:')) {
      markMailboxRead(userId);
    }
    const page = customId.startsWith('mb_read:') ? 0 : parseInt(parts[2] || '0') + (customId.startsWith('mb_next:') ? 1 : -1);
    const result = buildMailbox(userId, Math.max(0, page));
    return interaction.update({ embeds: [result.embed], components: result.components });
  }

  if (customId.startsWith('marry_accept:') || customId.startsWith('marry_decline:')) {
    const parts = customId.split(':');
    const action = parts[0];
    const proposerId = parts[1];
    const targetId = parts[2];

    if (interaction.user.id !== targetId) {
      return interaction.reply({ content: 'This proposal is not for you!', ephemeral: true });
    }

    if (action === 'marry_decline') {
      return interaction.update({ content: '\u{1F494} **' + interaction.user.username + '** declined the proposal from <@' + proposerId + '>. Maybe next time!', components: [] });
    }

    // Accept
    const proposer = getOrCreateUser(proposerId, 'Unknown');
    const accepter = getOrCreateUser(targetId, interaction.user.username);

    const m1 = getMarriage(proposerId);
    const m2 = getMarriage(targetId);
    if (m1 || m2) {
      return interaction.update({ content: '\u{1F494} Someone got married in the meantime! The proposal is cancelled.', components: [] });
    }

    createMarriage(proposerId, proposer.username, targetId, accepter.username);
    return interaction.update({ content: '\u{1F48D} **' + proposer.username + '** and **' + accepter.username + '** are now married! Congratulations! \u{1F389}', components: [] });
  }
}

async function handleSlashCommand(interaction) {
  const commandName = interaction.commandName;
  const userId = interaction.user.id;
  const username = interaction.user.username;

  const ownerCmds = ['givecoins', 'takecoins', 'setxp', 'addxp', 'setlevel', 'takelvl', 'resetuser', 'setlog', 'setbump', 'setbumpinterval', 'serverstats', 'backupdb', 'lllogs'];
  if (ownerCmds.includes(commandName) && !isOwner(userId)) {
    return interaction.reply({ content: 'Owner only command!', ephemeral: true });
  }

  // --- Moderation permission checks ---
  // kick / ban / timeout / to  →  server owner OR Administrator only
  const ownerOrAdminCmds = ['kick', 'ban', 'timeout', 'to'];
  if (ownerOrAdminCmds.includes(commandName)) {
    const isServerOwner = interaction.guild && interaction.user.id === interaction.guild.ownerId;
    const isAdmin = interaction.member && interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isServerOwner && !isAdmin) {
      return interaction.reply({ content: '❌ You need **Administrator** permission to use that command.', ephemeral: true });
    }
  }
  // purge  →  ManageMessages or Administrator
  if (commandName === 'purge') {
    const canPurge = interaction.member && (
      interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
      interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    );
    if (!canPurge) {
      return interaction.reply({ content: '❌ You need **Manage Messages** permission to use that command.', ephemeral: true });
    }
  }

  switch (commandName) {
    case 'ping': return interaction.reply('Pong! 🏓');
    case 'help': return handleHelp(interaction);
    case 'bl': return handleBalance(interaction, userId, username);
    case 'daily': return handleDaily(interaction, userId, username);
    case 'work': return handleWork(interaction, userId, username, interaction.options);
    case 'gamble': return handleGamble(interaction, userId, username, interaction.options);
    case 'pay': return handlePay(interaction, userId, username, interaction.options);
    case 'rob': return handleRob(interaction, userId, username, interaction.options);
    case 'shop': return handleShop(interaction);
    case 'buy': return handleBuy(interaction, userId, username, interaction.options);
    case 'rank': return handleRank(interaction, userId, username);
    case 'lb': return handleLeaderboard(interaction);

    case 'roll': return interaction.reply('You rolled a ' + (1 + Math.floor(Math.random() * (interaction.options.getInteger('sides') || 6))) + '!');
    case 'coinflip': return interaction.reply(Math.random() < 0.5 ? 'Heads!' : 'Tails!');
    case '8ball': {
      const r = ['It is certain.', 'Without a doubt.', 'Yes definitely.', 'Most likely.', 'Yes.', 'Signs point to yes.', 'Reply hazy try again.', 'Ask again later.', 'Do not count on it.', 'My reply is no.', 'Very doubtful.', 'Absolutely not.'];
      return interaction.reply(r[Math.floor(Math.random() * r.length)]);
    }
    case 'choose': {
      const opts = (interaction.options.getString('options') || '').split(',').map(s => s.trim()).filter(Boolean);
      if (opts.length < 2) return interaction.reply('Give at least 2 options separated by commas!');
      return interaction.reply('I choose ' + opts[Math.floor(Math.random() * opts.length)]);
    }
    case 'cookie': {
      const t = interaction.options.getUser('user');
      return interaction.reply(username + ' gave ' + (t ? '<@' + t.id + '>' : 'everyone') + ' a cookie!');
    }
    case 'pray': {
      const t = interaction.options.getUser('user');
      return interaction.reply(username + ' is praying for ' + (t ? '<@' + t.id + '>' : 'the void') + '!');
    }
    case 'curse': {
      const t = interaction.options.getUser('user');
      return interaction.reply(username + ' cursed ' + (t ? '<@' + t.id + '>' : 'the void') + '!');
    }
    case 'bell': {
      const t = interaction.options.getUser('user');
      return interaction.reply(username + ' rang the bell at ' + (t ? '<@' + t.id + '>' : 'everyone') + '!');
    }
    case 'rate': {
      const thing = interaction.options.getString('thing');
      if (!thing) return interaction.reply('What should I rate? Usage: .rate something');
      const rating = Math.floor(Math.random() * 11);
      return interaction.reply('I rate ' + thing + ' a ' + rating + '/10');
    }
    case 'poll': {
      const q = interaction.options.getString('question');
      if (!q) return interaction.reply('Ask a question! Usage: .poll your question?');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('poll_yes').setLabel('Yes').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('poll_no').setLabel('No').setStyle(ButtonStyle.Danger),
      );
      return interaction.reply({ content: 'Poll: ' + q, components: [row] });
    }
    case 'define': {
      const w = interaction.options.getString('word');
      if (!w) return interaction.reply('Define what? Usage: .define word');
      return interaction.reply(w + ": I'm a bot, not a dictionary. But it sounds cool!");
    }
    case 'grape': {
      const t = interaction.options.getUser('user');
      if (!t) return interaction.reply('Mention someone to grape! Or reply to their message with .grape');
      const grapeText = '<@' + userId + '> is graping <@' + t.id + '>!';
      if (GRAPE_GIFS.length > 0) {
        const gif = GRAPE_GIFS[Math.floor(Math.random() * GRAPE_GIFS.length)];
        const grapeEmbed = new EmbedBuilder().setDescription(grapeText).setImage(gif).setColor(0x5865F2);
        return interaction.reply({ embeds: [grapeEmbed] });
      }
      return interaction.reply(grapeText);
    }
    case 'beat': {
      const t = interaction.options.getUser('user');
      const senderDisplay = interaction.member ? interaction.member.displayName : username;
      let targetDisplay = 'the air';
      if (t) {
        try {
          const tm = await interaction.guild.members.fetch(t.id);
          targetDisplay = tm.displayName;
        } catch { targetDisplay = t.displayName || t.username; }
      }
      const beatText = '**' + senderDisplay + '** is beating **' + targetDisplay + '**!';
      if (BEAT_GIFS.length > 0) {
        const gif = BEAT_GIFS[Math.floor(Math.random() * BEAT_GIFS.length)];
        const beatEmbed = new EmbedBuilder().setDescription(beatText).setImage(gif).setColor(0x5865F2);
        return interaction.reply({ embeds: [beatEmbed] });
      }
      return interaction.reply(beatText);
    }
    case 'goon': {
      const t = interaction.options.getUser('user');
      if (!t) return interaction.reply('Mention someone to goon to! Or reply to their message with .goon');
      const goonText = '<@' + userId + '> is gooning to <@' + t.id + '>';
      if (GOON_GIFS.length > 0) {
        const gif = GOON_GIFS[Math.floor(Math.random() * GOON_GIFS.length)];
        const goonEmbed = new EmbedBuilder().setDescription(goonText).setImage(gif).setColor(0x5865F2);
        return interaction.reply({ embeds: [goonEmbed] });
      }
      return interaction.reply(goonText);
    }

    case 'userinfo': return handleUserInfo(interaction, interaction.options);
    case 'mailbox': return handleMailbox(interaction, userId);

    case 'kick': {
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      if (!target) return interaction.reply('Mention a user to kick!');
      try {
        const member = await interaction.guild.members.fetch(target.id);
        await member.kick(reason);
        return interaction.reply('Kicked <@' + target.id + '>. Reason: ' + reason);
      } catch { return interaction.reply('Failed to kick (need Kick Members permission or user not in server).'); }
    }
    case 'ban': {
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      if (!target) return interaction.reply('Mention a user to ban!');
      try {
        await interaction.guild.bans.create(target, { reason });
        return interaction.reply('Banned <@' + target.id + '>. Reason: ' + reason);
      } catch { return interaction.reply('Failed to ban (need Ban Members permission).'); }
    }
    case 'backupdb': {
      await interaction.deferReply({ ephemeral: true });
      const dbPath = require('path').join(require('fs').existsSync('/app/data') ? '/app/data' : __dirname, 'bot.db');
      if (!require('fs').existsSync(dbPath)) {
        return interaction.editReply({ content: 'Database file not found at ' + dbPath });
      }
      const { AttachmentBuilder } = require('discord.js');
      const now = new Date();
      const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const attachment = new AttachmentBuilder(dbPath, { name: 'bot_backup_' + stamp + '.db' });
      return interaction.editReply({ content: '💾 Database backup — ' + stamp, files: [attachment] });
    }

    case 'resetall': {
      if (interaction.user.id !== interaction.guild.ownerId) {
        return interaction.reply({ content: '❌ Only the server owner can do this.', ephemeral: true });
      }
      db.prepare('DELETE FROM users').run();
      try { db.prepare('DELETE FROM pets').run(); } catch {}
      try { db.prepare('DELETE FROM stock_portfolio').run(); } catch {}
      try { db.prepare('DELETE FROM achievements').run(); } catch {}
      db.prepare('DELETE FROM marriages').run();
      db.prepare('DELETE FROM mailbox').run();
      return interaction.reply({ content: '🗑️ All server data wiped — coins, XP, levels, pets, stocks, achievements, marriages, and mailbox have all been reset.', ephemeral: true });
    }

    case 'purge': {
      const amount = Math.min(interaction.options.getInteger('amount') || 1, 100);
      await interaction.deferReply({ ephemeral: true });
      try {
        const deleted = await interaction.channel.bulkDelete(amount, true);
        return interaction.editReply({ content: 'Deleted ' + deleted.size + ' messages!' });
      } catch { return interaction.editReply('Failed to purge (messages older than 14 days cannot be bulk deleted).'); }
    }

    case 'timeout': case 'to': {
      const target = interaction.options.getUser('user');
      const duration = interaction.options.getInteger('duration') || 300; // default 5 minutes
      if (!target) return interaction.reply({ content: 'Please mention a user to timeout.', ephemeral: true });
      try {
        const member = await interaction.guild.members.fetch(target.id);
        await member.timeout(duration * 1000);
        return interaction.reply({ content: '✅', ephemeral: true });
      } catch { return interaction.reply({ content: 'Failed to timeout (need Moderate Members permission).', ephemeral: true }); }
    }
    case 'givecoins': {
      const t = interaction.options.getUser('user'); const a = interaction.options.getInteger('amount');
      if (!t || !a) return interaction.reply('Usage: /givecoins @user amount');
      const p = getOrCreateUser(t.id, t.username);
      updateUser(t.id, { money: p.money + a });
      return interaction.reply('Gave ' + fmtNum(a) + ' coins to <@' + t.id + '>. Balance: ' + fmtNum(p.money + a) + '.');
    }
    case 'takecoins': {
      const t = interaction.options.getUser('user'); const a = interaction.options.getInteger('amount');
      if (!t || !a) return interaction.reply('Usage: /takecoins @user amount');
      const p = getOrCreateUser(t.id, t.username);
      const nm = Math.max(0, p.money - a);
      updateUser(t.id, { money: nm });
      return interaction.reply('Took ' + fmtNum(a) + ' coins from <@' + t.id + '>. Balance: ' + fmtNum(nm) + '.');
    }
    case 'setxp': {
      const t = interaction.options.getUser('user'); const xp = interaction.options.getInteger('amount');
      if (!t || xp === null) return interaction.reply('Usage: /setxp @user amount');
      updateUser(t.id, { xp: xp, level: levelFromXP(xp) });
      return interaction.reply('Set <@' + t.id + ">'s XP to " + fmtNum(xp) + ' (Level ' + levelFromXP(xp) + ').');
    }
    case 'addxp': {
      const t = interaction.options.getUser('user'); const a = interaction.options.getInteger('amount');
      if (!t || !a) return interaction.reply('Usage: /addxp @user amount');
      const p = getOrCreateUser(t.id, t.username);
      const nx = p.xp + a; const nl = levelFromXP(nx);
      updateUser(t.id, { xp: nx, level: nl });
      return interaction.reply('Added ' + fmtNum(a) + ' XP to <@' + t.id + '>. XP: ' + fmtNum(nx) + ' (Level ' + nl + ').');
    }
    case 'setlevel': {
      const t = interaction.options.getUser('user'); const l = interaction.options.getInteger('level');
      if (!t || l === null) return interaction.reply('Usage: /setlevel @user level');
      const xp = xpForLevel(l);
      updateUser(t.id, { xp, level: l });
      return interaction.reply('Set <@' + t.id + ">'s level to " + l + ' (XP: ' + fmtNum(xp) + ').');
    }
    case 'takelvl': {
      const t = interaction.options.getUser('user'); const l = interaction.options.getInteger('levels');
      if (!t || !l) return interaction.reply('Usage: /takelvl @user levels');
      const p = getOrCreateUser(t.id, t.username);
      const cl = p.level || levelFromXP(p.xp); const nl = Math.max(0, cl - l);
      updateUser(t.id, { xp: xpForLevel(nl), level: nl });
      return interaction.reply('Took ' + l + ' level(s) from <@' + t.id + '>. Now Level ' + nl + '.');
    }
    case 'resetuser': {
      const t = interaction.options.getUser('user');
      if (!t) return interaction.reply('Mention a user to reset!');
      updateUser(t.id, { money: 0, xp: 0, level: 0, gamble_streak: 0, vc_minutes: 0, last_daily: '', last_work: '', last_rob: '', shield_until: '', lucky_charm: 0, xp_boost_until: '', rob_bonus: 0, daily_boost: 0 });
      return interaction.reply('Reset <@' + t.id + ">'s profile completely.");
    }
    case 'setlog': {
      const c = interaction.options.getChannel('channel');
      setConfig('log_channel_id', c.id);
      return interaction.reply('Server log channel set to <#' + c.id + '>!');
    }
    case 'setbump': {
      const c = interaction.options.getChannel('channel');
      if (!c) return interaction.reply('Mention a channel! Usage: .setbump #channel');
      setConfig('bump_channel_id', c.id);
      return interaction.reply('Bump reminders will now go to <#' + c.id + '>!');
    }
    case 'setbumpinterval': {
      const h = interaction.options.getInteger('hours') || 0; const m = interaction.options.getInteger('minutes') || 0;
      const total = h * 60 + m;
      if (total < 30) return interaction.reply('Minimum is 30 minutes!');
      if (total > 1440) return interaction.reply('Maximum is 24 hours!');
      setConfig('bump_interval_minutes', total);
      setConfig('bump_last_sent', '1970-01-01T00:00:00.000Z');
      return interaction.reply('Bump interval set to ' + h + 'h ' + m + 'm!');
    }
    case 'marry': {
      const target = interaction.options.getUser('user');
      if (!target) return interaction.reply('Mention someone to propose to!');
      if (target.id === userId) return interaction.reply('You cannot marry yourself!');
      if (target.bot) return interaction.reply('You cannot marry a bot!');

      // Check if proposer is already married
      const myMarriage = getMarriage(userId);
      if (myMarriage) {
        const spouseId = myMarriage.user1_id === userId ? myMarriage.user2_name : myMarriage.user1_name;
        return interaction.reply('You are already married to **' + spouseId + '**! Use /divorce first.');
      }

      // Check if target is already married
      const theirMarriage = getMarriage(target.id);
      if (theirMarriage) {
        const theirSpouse = theirMarriage.user1_id === target.id ? theirMarriage.user2_name : theirMarriage.user1_name;
        return interaction.reply('**' + target.username + '** is already married to **' + theirSpouse + '**!');
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('marry_accept:' + userId + ':' + target.id).setLabel('Accept 💍').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('marry_decline:' + userId + ':' + target.id).setLabel('Decline 💔').setStyle(ButtonStyle.Danger),
      );
      return interaction.reply({
        content: '**' + username + '** is proposing to **' + target.username + '**! \u{1F48D}\n\n' + target.username + ', do you accept?',
        components: [row]
      });
    }
    case 'divorce': {
      const marriage = getMarriage(userId);
      if (!marriage) return interaction.reply('You are not married!');
      const spouseId = marriage.user1_id === userId ? marriage.user2_id : marriage.user1_id;
      const spouseName = marriage.user1_id === userId ? marriage.user2_name : marriage.user1_name;
      deleteMarriage(userId);
      return interaction.reply('💔 **' + username + '** and **' + spouseName + '** are now divorced. It was a good run.');
    }

    // ── New Feature Commands ──
    case 'bj': return handleBlackjack(interaction, db, getOrCreateUser, updateUser, addXPAndMoney, (uid, uname, triggers) => checkAndAwardAchievements(db, uid, uname, triggers));
    case 'slots': return handleSlots(interaction, getOrCreateUser, updateUser);
    case 'fish': return handleFish(interaction, db, getOrCreateUser, updateUser, (uid, uname, triggers) => checkAndAwardAchievements(db, uid, uname, triggers));
    case 'heist': return handleHeist(interaction, db, getOrCreateUser, updateUser, addXPAndMoney, (uid, uname, triggers) => checkAndAwardAchievements(db, uid, uname, triggers));
    case 'stocks': return handleStocks(interaction, db, getOrCreateUser, updateUser);
    case 'achievements': return handleAchievements(interaction, db);
    case 'lllogs': {
      const allLetters = db.prepare('SELECT * FROM love_letters ORDER BY sent_at DESC LIMIT 25').all();
      if (!allLetters.length) return interaction.reply({ content: '📭 No love letters have been sent yet.', ephemeral: true });
      const lines = allLetters.map((l, i) => {
        const date = l.sent_at ? l.sent_at.slice(0, 10) : '?';
        return `**${i+1}.** 📤 <@${l.sender_id}> (${l.sender_name}) → <@${l.target_id}>\n┗ *"${l.message}"* — ${date}`;
      }).join('\n\n');
      const embed = new EmbedBuilder()
        .setTitle('🔍 Love Letter Logs (Owner View)')
        .setColor(0xFF0000)
        .setDescription(lines)
        .setFooter({ text: 'Showing last 25 letters' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    case 'loveletter': return handleLoveLetter(interaction, db, client, allOwnerIds);
    case 'trivia': return handleTrivia(interaction, db, getOrCreateUser, updateUser, (uid, uname, triggers) => checkAndAwardAchievements(db, uid, uname, triggers));
    case 'pet': return handlePet(interaction, db, getOrCreateUser, updateUser, (uid, uname, triggers) => checkAndAwardAchievements(db, uid, uname, triggers));
    case 'serverstats': return handleServerStats(interaction, client);
    case 'slowmode': return handleSlowmode(interaction);
    case 'lock': return handleLock(interaction);
    case 'unlock': return handleUnlock(interaction);
  }

  if (!['ping', 'help', 'shop', 'bl', 'rank', 'lb', 'mailbox', 'slowmode', 'lock', 'unlock', ...ownerCmds].includes(commandName)) {
    const act = trackActivity(userId, username);
    if (act && act.leveledUp && LEVELUP_CHANNEL_ID) {
      postToChannel(LEVELUP_CHANNEL_ID, username + ' just reached Level ' + act.newLevel + '!');
    }
  }
}

function handleHelp(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('\u{1F4D6}  Command Reference')
    .setColor(0x5865F2)
    .setDescription(
      '> Use `/command` or `' + PREFIX + 'command` \u2014 both work the same way.\n' +
      '> Commands marked **\u{1F451}** are owner-only.'
    )
    .addFields(
      { name: '\u{1F3AE}  Games',      value: '`/bj` `/slots` `/fish` `/heist` `/trivia`', inline: true },
      { name: '\u{1F4B0}  Economy',    value: '`/daily` `/work` `/gamble` `/pay` `/rob`\n`/shop` `/buy` `/bl` `/rank` `/lb`', inline: true },
      { name: '\u{1F4C8}  Stocks',     value: '`/stocks market`\n`/stocks buy` `/stocks sell`\n`/stocks portfolio`', inline: true },
      { name: '\u{1F43E}  Social',     value: '`/achievements` `/pet`\n`/loveletter`', inline: true },
      { name: '\u{1F3B2}  Fun',        value: '`/roll` `/coinflip` `/8ball` `/choose`\n`/cookie` `/pray` `/curse` `/bell`\n`/rate` `/poll` `/define` `/grape`\n`/beat` `/goon` `/marry` `/divorce`', inline: true },
      { name: '\u{1F527}  Utility',    value: '`/ping` `/userinfo` `/mailbox` `/help`', inline: true },
      { name: '\u{1F528}  Moderation', value: '`/kick` `/ban` `/purge` `/timeout`\n`/slowmode` `/lock` `/unlock` `/setlog`', inline: true },
      { name: '\u{1F451}  Owner',      value: '`/givecoins` `/takecoins`\n`/setxp` `/addxp` `/setlevel` `/takelvl`\n`/resetuser` `/setbump` `/setbumpinterval`\n`/serverstats`', inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
    )
    .setFooter({ text: 'Tip: most commands also work with the . prefix  \u2022  Use /help anytime' })
    .setTimestamp();
  return interaction.reply({ embeds: [embed] });
}

function handleBalance(interaction, userId, username) {
  const user = getOrCreateUser(userId, username);
  const displayName = interaction.member ? interaction.member.displayName : username;
  const level = user.level || levelFromXP(user.xp);
  const xpToNext = xpForLevel(level + 1) - user.xp;
  const segments = 15;
  const xpInLevel = user.xp - xpForLevel(level);
  const xpForCur = xpForLevel(level + 1) - xpForLevel(level);
  const pct = Math.floor((xpInLevel / xpForCur) * 100);
  const filled = Math.floor((xpInLevel / xpForCur) * segments);
  const bar = '\ud83d\udd9a'.repeat(filled) + '\u2b1c'.repeat(segments - filled);
  const now = new Date();

  // Get rank
  const all = db.prepare('SELECT * FROM users ORDER BY xp DESC').all();
  const rank = all.findIndex(u => u.discord_user_id === userId) + 1;

  // Status checks
  const shieldActive = user.shield_until && new Date(user.shield_until) > now;
  const boostActive = isXpBoosted(user);
  const hasCharm = user.lucky_charm === 1;
  const hasGun = user.rob_bonus === 1;
  const hasDblDaily = user.daily_boost === 1;

  // Build active effects line
  const effects = [];
  if (shieldActive) effects.push('\ud83d\udee1\ufe0f Shield');
  if (boostActive) effects.push('\ud83d\udd25 XP Boost');
  if (hasCharm) effects.push('\ud83d\udc84 Lucky Charm');
  if (hasGun) effects.push('\ud83d\udd2b Gun');
  if (hasDblDaily) effects.push('\ud83d\udcb0 Double Daily');
  const effectsStr = effects.length > 0 ? effects.join(' \u2022 ') : '\u2744\ufe0f No active effects';

  // Gamble streak
  const streak = user.gamble_streak || 0;
  const streakStr = streak > 0 ? '\ud83d\udd25 ' + streak + ' win streak' : 'No streak';

  const colors = [0x95A5A6, 0x3498DB, 0x2ECC71, 0x9B59B6, 0xE67E22, 0xE74C3C, 0xF1C40F, 0x1ABC9C, 0xFF69B4, 0x5865F2];
  const color = colors[Math.min(level, colors.length - 1)];

  const embed = new EmbedBuilder()
    .setTitle('\ud83d\udcbc ' + displayName + (displayName !== username ? ' (' + username + ')' : '') + "'s Profile")
    .setColor(color)
    .addFields(
      { name: '\ud83d\udcb0 Coins', value: '```\n' + fmtNum(user.money) + '\n```', inline: true },
      { name: '\ud83c\udf96\ufe0f Level', value: '```\n' + level + '\n```', inline: true },
      { name: '\ud83d\udcca Rank', value: '```\n#' + rank + '/' + all.length + '\n```', inline: true },
      { name: '\u26a1 XP Progress', value: bar + '\n' + fmtNum(user.xp) + ' XP \u2022 ' + pct + '% to Lvl ' + (level + 1) + ' \u2022 ' + fmtNum(xpToNext) + ' XP to go', inline: false },
      { name: '\ud83c\udfa4 VC Time', value: formatVcTime(user.vc_minutes || 0), inline: true },
      { name: '\ud83c\udfb0 Gamble Streak', value: streakStr, inline: true },
      { name: '\u2728 Active Effects', value: effectsStr, inline: false },
    )
    .setFooter({ text: displayName + (displayName !== username ? ' (' + username + ')' : '') + ' \u2022 ' + (interaction.guild ? interaction.guild.name : 'Server') });
  return interaction.reply({ embeds: [embed] });
}

function handleDaily(interaction, userId, username) {
  const user = getOrCreateUser(userId, username);
  const now = new Date();
  if (user.last_daily) {
    const h = (now.getTime() - new Date(user.last_daily).getTime()) / 3600000;
    if (h < 24) {
      const mins = Math.ceil((24 - h) * 60);
      const hh = Math.floor(mins / 60);
      const mm = mins % 60;
      const timeStr = (hh > 0 ? hh + 'h ' : '') + mm + 'm';
      const embed = new EmbedBuilder()
        .setTitle('\ud83d\udd14 Daily Not Ready')
        .setColor(0xE74C3C)
        .setDescription('You already claimed your daily reward!\nCome back in **' + timeStr + '**.')
        .setFooter({ text: username });
      return interaction.reply({ embeds: [embed] });
    }
  }
  let reward = 50 + Math.floor(Math.random() * 100);
  const dblDaily = user.daily_boost === 1;
  if (dblDaily) {
    reward *= 2;
    updateUser(userId, { daily_boost: 0 });
  }
  const boosted = isXpBoosted(user);
  const baseXP = 20 + Math.floor(Math.random() * 30);
  const xpGain = boosted ? baseXP * 2 : baseXP;
  const { leveledUp, newLevel } = addXPAndMoney(userId, xpGain, reward);
  updateUser(userId, { last_daily: now.toISOString() });
  const dailyTriggers = ['first_daily'];
  const updatedUser = getOrCreateUser(userId, username);
  if (updatedUser.money >= 1000) dailyTriggers.push('rich_1k');
  if (updatedUser.money >= 10000) dailyTriggers.push('rich_10k');
  if (newLevel >= 5) dailyTriggers.push('level_5');
  if (newLevel >= 10) dailyTriggers.push('level_10');
  if (newLevel >= 25) dailyTriggers.push('level_25');
  checkAndAwardAchievements(db, userId, username, dailyTriggers);
  const newBalance = user.money + reward;

  const fields = [
    { name: '\ud83d\udcb0 Coins Earned', value: '**+' + fmtNum(reward) + '**' + (dblDaily ? ' \u2728 Double Daily!' : ''), inline: true },
    { name: '\u26a1 XP Earned', value: '**+' + fmtNum(xpGain) + '**' + (boosted ? ' \ud83d\udd25 Boosted!' : ''), inline: true },
    { name: '\ud83d\udcb3 New Balance', value: '**' + fmtNum(newBalance) + '** coins', inline: true },
  ];

  if (leveledUp) {
    fields.push({ name: '\ud83c\udfa6 Level Up!', value: 'You reached **Level ' + newLevel + '** \ud83c\udf89', inline: false });
  }

  const embed = new EmbedBuilder()
    .setTitle('\ud83c\udf81 Daily Reward Claimed!')
    .setColor(0xF1C40F)
    .addFields(fields)
    .setFooter({ text: username + ' \u2022 Next daily in 24h' });

  return interaction.reply({ embeds: [embed] });
}

function handleWork(interaction, userId, username, options) {
  const jobKey = options.getString('job');
  const job = JOBS[jobKey];
  if (!job) return interaction.reply('Unknown job! Use /help to see available jobs.');
  const user = getOrCreateUser(userId, username);
  const now = new Date();
  if (user.last_work) {
    const h = (now.getTime() - new Date(user.last_work).getTime()) / 3600000;
    if (h < 1) return interaction.reply('Come back in ' + Math.ceil((1 - h) * 60) + 'm.');
  }
  const earned = job.minPay + Math.floor(Math.random() * (job.maxPay - job.minPay + 1));
  const boosted = isXpBoosted(user);
  const baseXP = 15 + Math.floor(Math.random() * 25);
  const xpGain = boosted ? baseXP * 2 : baseXP;
  const { leveledUp, newLevel } = addXPAndMoney(userId, xpGain, earned);
  updateUser(userId, { last_work: now.toISOString(), last_work_job: jobKey });
  { const wu = getOrCreateUser(userId, username); const wt = []; if (wu.money >= 1000) wt.push('rich_1k'); if (wu.money >= 10000) wt.push('rich_10k'); if (newLevel >= 5) wt.push('level_5'); if (newLevel >= 10) wt.push('level_10'); if (newLevel >= 25) wt.push('level_25'); if (wt.length) checkAndAwardAchievements(db, userId, username, wt); }
  const quip = job.quips[Math.floor(Math.random() * job.quips.length)];
  let msg = 'You worked as **' + job.name + '**\n\n*' + quip + '*\n\n+' + earned + ' coins | +' + xpGain + ' XP' + (boosted ? ' (boosted)' : '');
  if (leveledUp) msg += '\n\n**LEVEL UP!** Level ' + newLevel + '!';
  return interaction.reply(msg);
}

function handleGamble(interaction, userId, username, options) {
  const amount = options.getInteger('amount');
  if (!amount || amount < 100) return interaction.reply('Please provide a bet of at least **100 coins**. Usage: `.gamble 100`');
  if (amount > 10000) return interaction.reply('Maximum bet is **10,000 coins**!');
  const user = getOrCreateUser(userId, username);
  if (user.money < 100) return interaction.reply('You need at least **100 coins** to gamble!');
  if (user.money < amount) return interaction.reply('You only have ' + fmtNum(user.money) + ' coins!');
  const hasCharm = user.lucky_charm === 1;
  let won;
  if (hasCharm) { won = true; updateUser(userId, { lucky_charm: 0 }); }
  else { won = Math.random() < 0.5; }
  const change = won ? amount : -amount;
  addXPAndMoney(userId, 5, change);
  const newStreak = won ? (user.gamble_streak || 0) + 1 : 0;
  updateUser(userId, { gamble_streak: newStreak });
  if (newStreak >= 5) checkAndAwardAchievements(db, userId, username, ['gamble_5']);
  let msg = won ? '**You won!** +' + amount + ' coins' + (hasCharm ? ' (lucky charm!)' : '') : '**You lost!** -' + amount + ' coins';
  if (won && newStreak >= 2) msg += ' 🔥 ' + newStreak + ' win streak!';
  msg += '\n\nBalance: ' + fmtNum(user.money + change) + ' coins';
  return interaction.reply(msg);
}

function handlePay(interaction, userId, username, options) {
  const target = options.getUser('user');
  const amount = options.getInteger('amount');
  if (!target) return interaction.reply('Who are you paying? Mention a user!');
  if (target.id === userId) return interaction.reply('Cannot pay yourself!');
  if (!amount || amount < 1) return interaction.reply('Minimum 1 coin!');
  const user = getOrCreateUser(userId, username);
  if (user.money < amount) return interaction.reply('You only have ' + fmtNum(user.money) + ' coins!');
  const targetUser = getOrCreateUser(target.id, target.username);
  updateUser(userId, { money: user.money - amount });
  updateUser(target.id, { money: targetUser.money + amount });
  return interaction.reply('Sent ' + fmtNum(amount) + ' coins to <@' + target.id + '>! Balance: ' + fmtNum(user.money - amount) + '.');
}

async function handleRob(interaction, userId, username, options) {
  const target = options.getUser('user');
  if (!target) return interaction.reply('Who are you robbing? Mention a user!');
  if (target.id === userId) return interaction.reply('Cannot rob yourself!');
  const robber = getOrCreateUser(userId, username);
  const now = new Date();
  if (robber.last_rob) {
    const h = (now.getTime() - new Date(robber.last_rob).getTime()) / 3600000;
    if (h < 1) return interaction.reply('Lay low for ' + Math.ceil((1 - h) * 60) + 'm.');
  }
  if (robber.money < 10) return interaction.reply('Need at least 10 coins!');

  const victim = getOrCreateUser(target.id, target.username);
  if (victim.money < 10) return interaction.reply(victim.username + ' is not worth robbing!');

  const vShield = victim.shield_until ? new Date(victim.shield_until) : null;
  if (vShield && vShield > now) return interaction.reply(victim.username + ' has a Shield!');

  const active = getActiveRobberies(target.id);
  const beingRobbed = active.some(r => (now.getTime() - new Date(r.created_at).getTime()) / 1000 < 30);
  if (beingRobbed) return interaction.reply(victim.username + ' is already being robbed!');

  const pct = 10 + Math.floor(Math.random() * 21);
  const steal = Math.floor((victim.money * pct) / 100);
  const penalty = Math.floor((robber.money * 30) / 100);

  const robberyId = createRobbery({
    robberId: userId, robberName: username, victimId: target.id, victimName: victim.username,
    stealAmount: steal, penaltyAmount: penalty, stealPercent: pct, channelId: interaction.channelId, createdAt: now.toISOString()
  });
  updateUser(userId, { last_rob: now.toISOString() });
  checkAndAwardAchievements(db, userId, username, ['first_rob']);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rob_stop:' + robberyId).setLabel('STOP').setStyle(ButtonStyle.Danger)
  );
  return interaction.reply({
    content: '**' + username + '** is attempting to rob **' + victim.username + '**!\n\n**' + victim.username + '**, press STOP to defend yourself! You have 30 seconds!',
    components: [row]
  });
}

function handleShop(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Server Shop')
    .setColor(0xF1C40F)
    .addFields(
      { name: 'Shield - 500 coins', value: 'Protects from robbery for 24 hours.' },
      { name: 'Lucky Charm - 300 coins', value: 'Next gamble is a guaranteed win!' },
      { name: 'XP Boost - 1000 coins', value: 'Double XP for 1 hour.' },
      { name: 'Nickname - 250 coins', value: 'Change your server nickname.' },
      { name: 'Lottery Ticket - 150 coins', value: 'Instant 15% chance to win 1500 coins!' },
      { name: 'Mystery Box - 500 coins', value: 'Random reward: coins, XP, items, or nothing!' },
      { name: 'Gun - 700 coins', value: '+20% steal amount on your next robbery.' },
      { name: 'Double Daily - 350 coins', value: 'Next /daily gives 2x coins!' },
    );
  return interaction.reply({ embeds: [embed] });
}

async function handleBuy(interaction, userId, username, options) {
  const item = options.getString('item');
  const shopItem = SHOP[item];
  if (!shopItem) {
    // Check if they tried to buy a stock symbol/name
    const STOCK_SYMBOLS = ['SEWER','COIN','BLAZE','GOONING','SAI','INFINITY'];
    const itemUpper = (item || '').toUpperCase().replace(/\s+/g, '');
    const looksLikeStock = STOCK_SYMBOLS.some(s => itemUpper.includes(s));
    if (looksLikeStock) {
      return interaction.reply('That\'s a stock, not a shop item! Use `/stocks buy` to buy stocks — e.g. `/stocks buy GOONING 1`');
    }
    return interaction.reply('Unknown item! Use `/shop` to see available shop items.');
  }
  const user = getOrCreateUser(userId, username);
  if (user.money < shopItem.price) return interaction.reply('Need ' + shopItem.price + ' coins, you have ' + user.money + '!');
  const now = new Date();

  if (item === 'shield') {
    const until = new Date(now.getTime() + 86400000);
    updateUser(userId, { money: user.money - shopItem.price, shield_until: until.toISOString() });
    return interaction.reply('**Shield activated!** 24h protection. Balance: ' + fmtNum(user.money - shopItem.price) + '.');
  }
  if (item === 'charm') {
    if (user.lucky_charm) return interaction.reply('Already have a Lucky Charm!');
    updateUser(userId, { money: user.money - shopItem.price, lucky_charm: 1 });
    return interaction.reply('**Lucky Charm purchased!** Next gamble is a win! Balance: ' + fmtNum(user.money - shopItem.price) + '.');
  }
  if (item === 'boost') {
    const until = new Date(now.getTime() + 3600000);
    updateUser(userId, { money: user.money - shopItem.price, xp_boost_until: until.toISOString() });
    return interaction.reply('**XP Boost activated!** 1h of double XP. Balance: ' + fmtNum(user.money - shopItem.price) + '.');
  }
  if (item === 'nickname') {
    const newNick = options.getString('nickname');
    if (!newNick) return interaction.reply('Provide a nickname! .buy nickname NewName');
    if (newNick.length > 32) return interaction.reply('Max 32 characters!');
    try {
      const member = await interaction.guild['members'].fetch(userId);
      await member.setNickname(newNick);
      updateUser(userId, { money: user.money - shopItem.price });
      return interaction.reply('**Nickname changed to "' + newNick + '"!** Balance: ' + fmtNum(user.money - shopItem.price) + '.');
    } catch { return interaction.reply('Failed to change nickname.'); }
  }
  if (item === 'lottery') {
    updateUser(userId, { money: user.money - shopItem.price });
    const won = Math.random() < 0.15;
    if (won) {
      const prize = 1500;
      updateUser(userId, { money: (user.money - shopItem.price) + prize });
      return interaction.reply('🎫 **LOTTERY WIN!** You won ' + fmtNum(prize) + ' coins! Balance: ' + fmtNum((user.money - shopItem.price) + prize) + '.');
    }
    return interaction.reply('🎫 Lottery ticket... no win this time. Better luck next time! Balance: ' + fmtNum(user.money - shopItem.price) + '.');
  }
  if (item === 'mystery') {
    updateUser(userId, { money: user.money - shopItem.price });
    let rewards = [
      { label: '500 coins', action: () => { updateUser(userId, { money: (user.money - shopItem.price) + 500 }); return 'You got **500 coins**!'; } },
      { label: '1000 coins', action: () => { updateUser(userId, { money: (user.money - shopItem.price) + 1000 }); return 'You got **1000 coins**!'; } },
      { label: '200 XP', action: () => { addXPAndMoney(userId, 200, 0); return 'You got **200 XP**!'; } },
      { label: 'Shield 24h', action: () => { const until = new Date(Date.now() + 86400000); updateUser(userId, { shield_until: until.toISOString() }); return 'You got a **Shield (24h)**!'; } },
      { label: 'Lucky Charm', action: () => { updateUser(userId, { lucky_charm: 1 }); return 'You got a **Lucky Charm**!'; } },
      { label: 'nothing', action: () => { return 'You got... **nothing**. Tough luck!'; } },
      { label: '150 coins back', action: () => { updateUser(userId, { money: (user.money - shopItem.price) + 150 }); return 'You got **150 coins back**.'; } },
    ];
    // Filter out Lucky Charm if user already has one
    if (user.lucky_charm) rewards = rewards.filter(r => r.label !== 'Lucky Charm');
    const reward = rewards[Math.floor(Math.random() * rewards.length)];
    const result = reward.action();
    return interaction.reply('🎁 **Mystery Box opened!** ' + result + ' Balance: ' + fmtNum(getOrCreateUser(userId, username).money) + '.');
  }
  if (item === 'robkit') {
    if (user.rob_bonus) return interaction.reply('You already have a Gun equipped!');
    updateUser(userId, { money: user.money - shopItem.price, rob_bonus: 1 });
    return interaction.reply('**Gun equipped!** +20% steal on your next robbery. Balance: ' + fmtNum(user.money - shopItem.price) + '.');
  }
  if (item === 'dailymult') {
    if (user.daily_boost) return interaction.reply('You already have a Double Daily active!');
    updateUser(userId, { money: user.money - shopItem.price, daily_boost: 1 });
    return interaction.reply('**Double Daily activated!** Next /daily gives 2x coins. Balance: ' + fmtNum(user.money - shopItem.price) + '.');
  }
}

function handleRank(interaction, userId, username) {
  const user = getOrCreateUser(userId, username);
  const all = db.prepare('SELECT * FROM users ORDER BY xp DESC').all();
  const rank = all.findIndex(u => u.discord_user_id === userId) + 1;
  const level = user.level || levelFromXP(user.xp);
  return interaction.reply('**' + username + '** — Rank **#' + rank + '/' + all.length + '** • Level **' + level + '** • **' + fmtNum(user.xp) + ' XP**');
}

async function handleLeaderboard(interaction) {
  const all = db.prepare('SELECT * FROM users ORDER BY xp DESC').all();
  if (!all.length) return interaction.reply('No users yet!');

  const richest = [...all].sort((a, b) => b.money - a.money).slice(0, 10);
  const highest = [...all].sort((a, b) => b.xp   - a.xp  ).slice(0, 10);
  const vcTop   = [...all].sort((a, b) => (b.vc_minutes || 0) - (a.vc_minutes || 0)).slice(0, 10);

  const displayNames = {};
  if (interaction.guild) {
    for (const p of [...new Set([...richest, ...highest, ...vcTop])]) {
      try { const m = await interaction.guild.members.fetch(p.discord_user_id); displayNames[p.discord_user_id] = m.displayName || null; }
      catch { displayNames[p.discord_user_id] = null; }
    }
  }

  const medals = ['\uD83E\uDD47','\uD83E\uDD48','\uD83E\uDD49','4\uFE0F\u20E3','5\uFE0F\u20E3','6\uFE0F\u20E3','7\uFE0F\u20E3','8\uFE0F\u20E3','9\uFE0F\u20E3','\uD83D\uDD1F'];

  function dname(p) {
    const d = displayNames[p.discord_user_id];
    return d && d !== p.username ? `**${d}**` : `**${p.username}**`;
  }

  const TABS = {
    coins: {
      title: '\uD83D\uDCB0  Richest Users',
      color: 0xF1C40F,
      header: '> *The wealthiest members on the server*\n\u200B',
      lines: richest.map((p, i) => `${medals[i]} ${dname(p)}\n\u2517 \`${fmtNum(p.money)} coins\``),
    },
    level: {
      title: '\uD83D\uDE80  Highest Level',
      color: 0x2ECC71,
      header: '> *The most experienced members*\n\u200B',
      lines: highest.map((p, i) => `${medals[i]} ${dname(p)}\n\u2517 \`Level ${levelFromXP(p.xp)}  \u2022  ${fmtNum(p.xp)} XP\``),
    },
    vc: {
      title: '\uD83C\uDFA4  Most Time in VC',
      color: 0x9B59B6,
      header: '> *The most active voice chat members*\n\u200B',
      lines: vcTop.map((p, i) => `${medals[i]} ${dname(p)}\n\u2517 \`${formatVcTime(p.vc_minutes || 0)}\``),
    },
  };

  function buildEmbed(tab) {
    const t = TABS[tab];
    return new EmbedBuilder()
      .setTitle(t.title)
      .setColor(t.color)
      .setDescription(t.header + (t.lines.length ? t.lines.join('\n') : 'No data yet.'))
      .setFooter({ text: `${interaction.guild ? interaction.guild.name : 'Server'} \u2022 ${all.length} users tracked` });
  }

  function buildRow(active) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lb:coins').setLabel('\uD83D\uDCB0 Richest').setStyle(active === 'coins' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('lb:level').setLabel('\uD83D\uDE80 Level') .setStyle(active === 'level' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('lb:vc')   .setLabel('\uD83C\uDFA4 VC Time').setStyle(active === 'vc'    ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }

  const msg = await interaction.reply({ embeds: [buildEmbed('coins')], components: [buildRow('coins')], fetchReply: true });

  const collector = msg.createMessageComponentCollector({ time: 120000 });
  collector.on('collect', async btn => {
    const tab = btn.customId.split(':')[1];
    await btn.update({ embeds: [buildEmbed(tab)], components: [buildRow(tab)] });
  });
  collector.on('end', () => { msg.edit({ components: [] }).catch(() => {}); });
}

function handleUserInfo(interaction, options) {
  const target = options.getUser('user') || interaction.user;
  const user = getOrCreateUser(target.id, target.username);
  const level = user.level || levelFromXP(user.xp);
  const embed = new EmbedBuilder()
    .setTitle(user.username)
    .setColor(0x5865F2)
    .addFields(
      { name: 'Level', value: String(level), inline: true },
      { name: 'XP', value: fmtNum(user.xp), inline: true },
      { name: 'Coins', value: fmtNum(user.money), inline: true },
      { name: 'VC Time', value: formatVcTime(user.vc_minutes || 0), inline: true },
    );
  return interaction.reply({ embeds: [embed] });
}

function buildMailbox(userId, page) {
  const mentions = getMailbox(userId);
  if (!mentions.length) {
    return { embed: new EmbedBuilder().setTitle('Mailbox').setColor(0x5865F2).setDescription('Your mailbox is empty!'), components: [] };
  }
  const perPage = 5;
  const totalPages = Math.ceil(mentions.length / perPage);
  const pageIdx = Math.max(0, Math.min(page, totalPages - 1));
  const items = mentions.slice(pageIdx * perPage, pageIdx * perPage + perPage);
  const embed = new EmbedBuilder()
    .setTitle('Mailbox')
    .setColor(0x5865F2)
    .addFields(items.map(m => {
      const content = (m.message_content || '*(no content)*').substring(0, 800);
      const badge = m.read ? '✅ Read' : '🔵 New';
      const ts = m.created_date ? `<t:${Math.floor(new Date(m.created_date).getTime() / 1000)}:R>` : '';
      return {
        name: (m.read ? '' : '🔵 ') + 'From **' + (m.sender_name || 'Unknown') + '** in <#' + m.channel_id + '>',
        value: content + '\n' + badge + (ts ? ' • ' + ts : ''),
      };
    }))
    .setFooter({ text: mentions.length + ' mentions total' });

  const row = new ActionRowBuilder();
  if (totalPages > 1) {
    row.addComponents(
      new ButtonBuilder().setCustomId('mb_prev:' + userId + ':' + pageIdx).setLabel('Prev').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx === 0),
      new ButtonBuilder().setCustomId('mb_page:' + userId + ':' + pageIdx).setLabel('Page ' + (pageIdx + 1) + '/' + totalPages).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('mb_next:' + userId + ':' + pageIdx).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx >= totalPages - 1),
    );
  }
  row.addComponents(
    new ButtonBuilder().setCustomId('mb_read:' + userId + ':' + pageIdx).setLabel('Mark Read').setStyle(ButtonStyle.Primary),
  );
  return { embed, components: [row] };
}

function handleMailbox(interaction, userId) {
  const result = buildMailbox(userId, 0);
  return interaction.reply({ embeds: [result.embed], components: result.components });
}

client.login(TOKEN);

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
  SlashCommandBuilder, Partials, PermissionFlagsBits
} = require('discord.js');

const {
  db, getOrCreateUser, updateUser, levelFromXP, xpForLevel, addXPAndMoney,
  getConfig, setConfig, createRobbery, getRobbery, getActiveRobberies, updateRobbery,
  getMailbox, markMailboxRead
} = require('./database');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LEVELUP_CHANNEL_ID = process.env.LEVELUP_CHANNEL_ID || '';
const PREFIX = process.env.PREFIX || '.';

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
  shield: { name: 'Rob Shield', price: 500 },
  charm: { name: 'Lucky Charm', price: 300 },
  boost: { name: 'XP Boost', price: 1000 },
  nickname: { name: 'Nickname Change', price: 250 },
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
  userinfo: ['user:user?'],
  kick: ['user:user', 'reason:rest?'],
  ban: ['user:user', 'reason:rest?'],
  purge: ['amount:int'],
  to: ['user:user', 'duration:int', 'reason:rest?'],
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

  const cleanArgs = rawArgs.filter(a => !/^<(@!?|#)(\d+)>$/.test(a));
  let aIdx = 0;
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

  return {
    getString: (n) => parsed[n] && parsed[n].type === 'string' ? parsed[n].value : null,
    getInteger: (n) => parsed[n] && parsed[n].type === 'int' ? parsed[n].value : null,
    getUser: (n) => parsed[n] && parsed[n].type === 'user' ? parsed[n].value : null,
    getChannel: (n) => parsed[n] && parsed[n].type === 'channel' ? parsed[n].value : null,
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
      const stealAmount = Math.min(r.steal_amount, victim.money);
      if (stealAmount > 0) {
        updateUser(r.victim_id, { money: victim.money - stealAmount });
        updateUser(r.robber_id, { money: robber.money + stealAmount });
      }
      updateRobbery(r.id, { status: 'success', steal_amount: stealAmount });
      postToChannel(r.channel_id, r.robber_name + ' successfully robbed ' + r.victim_name + ' and stole ' + fmtNum(stealAmount) + ' coins!');
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

client.once('ready', () => {
  console.log(client.user.tag + ' is online!');
  console.log('Slash commands: /ping, /work, etc.');
  console.log('Dot commands: ' + PREFIX + 'ping, ' + PREFIX + 'work barista, etc.');

  setInterval(resolveStaleRobberies, 30000);
  setInterval(checkBumpReminder, 300000);
  setInterval(pollMessages, 300000);
  setInterval(trackVoiceChannels, 60000);
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot || !message.guild) return;
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
      'bell', 'rate', 'poll', 'define', 'grape', 'beat', 'userinfo', 'mailbox',
      'kick', 'ban', 'purge', 'setlog', 'to',
      'givecoins', 'takecoins', 'setxp', 'addxp', 'setlevel', 'takelvl', 'resetuser',
      'setbump', 'setbumpinterval'
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
    if (GUILD_ID && guild.id !== GUILD_ID) continue;
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
    if (GUILD_ID && guild.id !== GUILD_ID) continue;
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

          for (const mention of msg['mentions'].users.values()) {
            if (mention.id === msg.author.id) continue;
            if (mention.id === client.user.id) continue;
            db.prepare('INSERT INTO mailbox (channel_id, mentioned_user_id, message_content, message_id, sender_id, sender_name) VALUES (?, ?, ?, ?, ?, ?)').run(
              channelId, mention.id, msg.content ? msg.content.substring(0, 1024) : '', msg.id, msg.author.id, msg.author.username
            );
          }

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
            postToChannel(LEVELUP_CHANNEL_ID, info.username + ' just reached Level ' + newLevel + '! Keep chatting!');
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
}

async function handleSlashCommand(interaction) {
  const commandName = interaction.commandName;
  const userId = interaction.user.id;
  const username = interaction.user.username;

  const ownerCmds = ['givecoins', 'takecoins', 'setxp', 'addxp', 'setlevel', 'takelvl', 'resetuser', 'setlog', 'setbump', 'setbumpinterval'];
  if (ownerCmds.includes(commandName) && !isOwner(userId)) {
    return interaction.reply({ content: 'Owner only command!', ephemeral: true });
  }

  // --- Moderation permission checks (before switch so it always runs) ---
  const modPerms = {
    kick: 'KickMembers',
    ban: 'BanMembers',
    purge: 'ManageMessages',
    timeout: 'ModerateMembers',
    to: 'ModerateMembers',
  };
  if (modPerms[commandName] && (!interaction.member || !interaction.member.permissions.has(PermissionFlagsBits[modPerms[commandName]]))) {
    return interaction.reply({ content: 'You dont have perms to do that.', ephemeral: true });
  }

  switch (commandName) {
    case 'ping': return interaction.reply('Pong!');
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
      const rating = Math.floor(Math.random() * 11);
      return interaction.reply('I rate ' + thing + ' a ' + rating + '/10');
    }
    case 'poll': {
      const q = interaction.options.getString('question');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('poll_yes').setLabel('Yes').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('poll_no').setLabel('No').setStyle(ButtonStyle.Danger),
      );
      return interaction.reply({ content: 'Poll: ' + q, components: [row] });
    }
    case 'define': {
      const w = interaction.options.getString('word');
      return interaction.reply(w + ": I'm a bot, not a dictionary. But it sounds cool!");
    }
    case 'grape': {
      const t = interaction.options.getUser('user');
      return interaction.reply(username + ' threw grapes at ' + (t ? '<@' + t.id + '>' : 'everyone') + '!');
    }
    case 'beat': {
      const t = interaction.options.getUser('user');
      return interaction.reply(username + ' beat ' + (t ? '<@' + t.id + '>' : 'the air') + ' with a pillow!');
    }

    case 'userinfo': return handleUserInfo(interaction, interaction.options);
    case 'mailbox': return handleMailbox(interaction, userId);

    case 'kick': {
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      try {
        await interaction.guild['members'].kick(target, reason);
        return interaction.reply('Kicked <@' + target.id + '>. Reason: ' + reason);
      } catch { return interaction.reply('Failed to kick (need Kick Members permission).'); }
    }
    case 'ban': {
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      try {
        await interaction.guild.bans.create(target, { reason });
        return interaction.reply('Banned <@' + target.id + '>. Reason: ' + reason);
      } catch { return interaction.reply('Failed to ban (need Ban Members permission).'); }
    }
    case 'purge': {
      const amount = Math.min(interaction.options.getInteger('amount') || 1, 100);
      try {
        await interaction.channel.bulkDelete(amount);
        return interaction.reply({ content: 'Deleted ' + amount + ' messages!', ephemeral: true });
      } catch { return interaction.reply('Failed to purge.'); }
    }

    case 'timeout': case 'to': {
      const target = interaction.options.getUser('user');
      const duration = interaction.options.getInteger('duration');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      if (!target) return interaction.reply('Please mention a user to timeout.');
      if (!duration || duration < 1) return interaction.reply('Duration must be at least 1 second.');
      try {
        const member = await interaction.guild['members'].fetch(target.id);
        await member.timeout(duration * 1000, reason);
        const timeStr = duration >= 60 ? Math.floor(duration / 60) + ' min' : duration + ' sec';
        return interaction.reply('Timed out <@' + target.id + '> for ' + timeStr + '. Reason: ' + reason);
      } catch { return interaction.reply('Failed to timeout (need Moderate Members permission).'); }
    }
    case 'givecoins': {
      const t = interaction.options.getUser('user'); const a = interaction.options.getInteger('amount');
      const p = getOrCreateUser(t.id, t.username);
      updateUser(t.id, { money: p.money + a });
      return interaction.reply('Gave ' + fmtNum(a) + ' coins to <@' + t.id + '>. Balance: ' + fmtNum(p.money + a) + '.');
    }
    case 'takecoins': {
      const t = interaction.options.getUser('user'); const a = interaction.options.getInteger('amount');
      const p = getOrCreateUser(t.id, t.username);
      const nm = Math.max(0, p.money - a);
      updateUser(t.id, { money: nm });
      return interaction.reply('Took ' + fmtNum(a) + ' coins from <@' + t.id + '>. Balance: ' + fmtNum(nm) + '.');
    }
    case 'setxp': {
      const t = interaction.options.getUser('user'); const xp = interaction.options.getInteger('amount');
      updateUser(t.id, { xp: xp, level: levelFromXP(xp) });
      return interaction.reply('Set <@' + t.id + ">'s XP to " + fmtNum(xp) + ' (Level ' + levelFromXP(xp) + ').');
    }
    case 'addxp': {
      const t = interaction.options.getUser('user'); const a = interaction.options.getInteger('amount');
      const p = getOrCreateUser(t.id, t.username);
      const nx = p.xp + a; const nl = levelFromXP(nx);
      updateUser(t.id, { xp: nx, level: nl });
      return interaction.reply('Added ' + fmtNum(a) + ' XP to <@' + t.id + '>. XP: ' + fmtNum(nx) + ' (Level ' + nl + ').');
    }
    case 'setlevel': {
      const t = interaction.options.getUser('user'); const l = interaction.options.getInteger('level');
      const xp = xpForLevel(l);
      updateUser(t.id, { xp, level: l });
      return interaction.reply('Set <@' + t.id + ">'s level to " + l + ' (XP: ' + fmtNum(xp) + ').');
    }
    case 'takelvl': {
      const t = interaction.options.getUser('user'); const l = interaction.options.getInteger('levels');
      const p = getOrCreateUser(t.id, t.username);
      const cl = p.level || levelFromXP(p.xp); const nl = Math.max(0, cl - l);
      updateUser(t.id, { xp: xpForLevel(nl), level: nl });
      return interaction.reply('Took ' + l + ' level(s) from <@' + t.id + '>. Now Level ' + nl + '.');
    }
    case 'resetuser': {
      const t = interaction.options.getUser('user');
      updateUser(t.id, { money: 0, xp: 0, level: 0, gamble_streak: 0, vc_minutes: 0, last_daily: '', last_work: '', last_rob: '', shield_until: '', lucky_charm: 0, xp_boost_until: '' });
      return interaction.reply('Reset <@' + t.id + ">'s profile completely.");
    }
    case 'setlog': {
      const c = interaction.options.getChannel('channel');
      setConfig('log_channel_id', c.id);
      return interaction.reply('Server log channel set to <#' + c.id + '>!');
    }
    case 'setbump': {
      const c = interaction.options.getChannel('channel');
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
  }

  if (!['ping', 'help', 'shop', 'bl', 'rank', 'lb', 'mailbox', ...ownerCmds].includes(commandName)) {
    const act = trackActivity(userId, username);
    if (act && act.leveledUp && LEVELUP_CHANNEL_ID) {
      postToChannel(LEVELUP_CHANNEL_ID, username + ' just reached Level ' + act.newLevel + '!');
    }
  }
}

function handleHelp(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Bot Commands')
    .setColor(0x5865F2)
    .setDescription('Slash: /ping, /work, etc.\nDot: ' + PREFIX + 'ping, ' + PREFIX + 'work barista, etc.\nBoth work the same way!')
    .addFields(
      { name: 'Fun', value: '/roll /coinflip /8ball /choose /cookie /pray /curse /bell /define /rate /poll /grape /beat' },
      { name: 'Economy', value: '/daily /work /gamble /pay /rob /shop /buy /bl /rank /lb' },
      { name: 'Utility', value: '/ping /userinfo /mailbox /help' },
      { name: 'Moderation', value: '/kick /ban /purge /timeout (.to) /setlog' },
      { name: 'Owner', value: '/givecoins /takecoins /setxp /addxp /setlevel /takelvl /resetuser /setbump /setbumpinterval' },
    );
  return interaction.reply({ embeds: [embed] });
}

function handleBalance(interaction, userId, username) {
  const user = getOrCreateUser(userId, username);
  const level = user.level || levelFromXP(user.xp);
  const xpToNext = xpForLevel(level + 1) - user.xp;
  const segments = 20;
  const xpInLevel = user.xp - xpForLevel(level);
  const xpForCur = xpForLevel(level + 1) - xpForLevel(level);
  const filled = Math.floor((xpInLevel / xpForCur) * segments);
  const bar = '#'.repeat(filled) + '-'.repeat(segments - filled);
  const now = new Date();

  const shield = user.shield_until && new Date(user.shield_until) > now ? 'Active' : 'None';
  const boost = user.xp_boost_until && new Date(user.xp_boost_until) > now ? 'Active' : 'None';

  const colors = [0x95A5A6, 0x3498DB, 0x2ECC71, 0x9B59B6, 0xE67E22, 0xE74C3C, 0xF1C40F, 0x1ABC9C, 0xFF69B4, 0x5865F2];
  const color = colors[Math.min(level, colors.length - 1)];

  const embed = new EmbedBuilder()
    .setTitle(username + "'s Balance")
    .setColor(color)
    .addFields(
      { name: 'Coins', value: '**' + fmtNum(user.money) + '**', inline: true },
      { name: 'Level', value: '**' + level + '**', inline: true },
      { name: 'XP', value: '**' + fmtNum(user.xp) + '**', inline: true },
      { name: 'Progress', value: '`' + bar + '` ' + fmtNum(xpToNext) + ' XP to Lvl ' + (level + 1) },
      { name: 'VC Time', value: formatVcTime(user.vc_minutes || 0), inline: true },
      { name: 'Shield', value: shield, inline: true },
      { name: 'Boost', value: boost, inline: true },
    );
  return interaction.reply({ embeds: [embed] });
}

function handleDaily(interaction, userId, username) {
  const user = getOrCreateUser(userId, username);
  const now = new Date();
  if (user.last_daily) {
    const h = (now.getTime() - new Date(user.last_daily).getTime()) / 3600000;
    if (h < 24) return interaction.reply('Come back in ' + Math.ceil((24 - h) * 60) + 'm!');
  }
  const reward = 50 + Math.floor(Math.random() * 100);
  const boosted = isXpBoosted(user);
  const baseXP = 20 + Math.floor(Math.random() * 30);
  const xpGain = boosted ? baseXP * 2 : baseXP;
  const { leveledUp, newLevel } = addXPAndMoney(userId, xpGain, reward);
  updateUser(userId, { last_daily: now.toISOString() });
  let msg = '**Daily Reward!**\n\n+' + reward + ' coins | +' + xpGain + ' XP' + (boosted ? ' (boosted)' : '');
  if (leveledUp) msg += '\n\n**LEVEL UP!** Level ' + newLevel + '!';
  return interaction.reply(msg);
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
  const quip = job.quips[Math.floor(Math.random() * job.quips.length)];
  let msg = 'You worked as **' + job.name + '**\n\n*' + quip + '*\n\n+' + earned + ' coins | +' + xpGain + ' XP' + (boosted ? ' (boosted)' : '');
  if (leveledUp) msg += '\n\n**LEVEL UP!** Level ' + newLevel + '!';
  return interaction.reply(msg);
}

function handleGamble(interaction, userId, username, options) {
  const amount = options.getInteger('amount');
  if (!amount || amount < 10) return interaction.reply('Minimum bet is 10 coins!');
  const user = getOrCreateUser(userId, username);
  if (user.money < amount) return interaction.reply('You only have ' + fmtNum(user.money) + ' coins!');
  const hasCharm = user.lucky_charm === 1;
  let won;
  if (hasCharm) { won = true; updateUser(userId, { lucky_charm: 0 }); }
  else { won = Math.random() < 0.5; }
  const change = won ? amount : -amount;
  addXPAndMoney(userId, 5, change);
  let msg = won ? '**You won!** +' + amount + ' coins' + (hasCharm ? ' (lucky charm!)' : '') : '**You lost!** -' + amount + ' coins';
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
  if (vShield && vShield > now) return interaction.reply(victim.username + ' has a Rob Shield!');

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
      { name: 'Rob Shield - 500 coins', value: 'Protects from robbery for 24 hours.' },
      { name: 'Lucky Charm - 300 coins', value: 'Next gamble is a guaranteed win!' },
      { name: 'XP Boost - 1000 coins', value: 'Double XP for 1 hour.' },
      { name: 'Nickname - 250 coins', value: 'Change your server nickname.' },
    );
  return interaction.reply({ embeds: [embed] });
}

async function handleBuy(interaction, userId, username, options) {
  const item = options.getString('item');
  const shopItem = SHOP[item];
  if (!shopItem) return interaction.reply('Unknown item! Use /shop to see items.');
  const user = getOrCreateUser(userId, username);
  if (user.money < shopItem.price) return interaction.reply('Need ' + shopItem.price + ' coins, you have ' + user.money + '!');
  const now = new Date();

  if (item === 'shield') {
    const until = new Date(now.getTime() + 86400000);
    updateUser(userId, { money: user.money - shopItem.price, shield_until: until.toISOString() });
    return interaction.reply('**Rob Shield activated!** 24h protection. Balance: ' + fmtNum(user.money - shopItem.price) + '.');
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
}

function handleRank(interaction, userId, username) {
  const user = getOrCreateUser(userId, username);
  const all = db.prepare('SELECT * FROM users ORDER BY xp DESC').all();
  const rank = all.findIndex(u => u.discord_user_id === userId) + 1;
  const level = user.level || levelFromXP(user.xp);
  return interaction.reply('**' + username + '** — Rank **#' + rank + '/' + all.length + '** • Level **' + level + '** • **' + fmtNum(user.xp) + ' XP**');
}

function handleLeaderboard(interaction) {
  const all = db.prepare('SELECT * FROM users ORDER BY xp DESC').all();
  if (!all.length) return interaction.reply('No users yet!');
  const medals = ['1st', '2nd', '3rd', '4th', '5th'];
  const richest = [...all].sort((a, b) => b.money - a.money).slice(0, 5);
  const highest = [...all].sort((a, b) => b.xp - a.xp).slice(0, 5);
  const vcTime = [...all].sort((a, b) => (b.vc_minutes || 0) - (a.vc_minutes || 0)).slice(0, 5);

  let msg = '**SERVER LEADERBOARD**\n\n';
  msg += '**Richest**\n';
  richest.forEach((p, i) => { msg += medals[i] + ' **' + p.username + '** — ' + fmtNum(p.money) + ' coins\n'; });
  msg += '\n**Highest Level**\n';
  highest.forEach((p, i) => { msg += medals[i] + ' **' + p.username + '** — Lvl ' + levelFromXP(p.xp) + '\n'; });
  msg += '\n**Longest Time in VC**\n';
  vcTime.forEach((p, i) => { msg += medals[i] + ' **' + p.username + '** — ' + formatVcTime(p.vc_minutes || 0) + '\n'; });
  if (msg.length > 2000) msg = msg.substring(0, 1997) + '...';
  return interaction.reply(msg);
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
    .addFields(items.map(m => ({
      name: 'From **' + (m.sender_name || 'Unknown') + '** in <#' + m.channel_id + '>',
      value: (m['message_content'] || '(no content)') + '\n' + (m.read ? 'Read' : 'New')
    })))
    .setFooter({ text: mentions.length + ' mentions total' });

  const row = new ActionRowBuilder();
  if (totalPages > 1) {
    row.addComponents(
      new ButtonBuilder().setCustomId('mb_prev:' + userId + ':' + pageIdx).setLabel('Prev').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx === 0),
      new ButtonBuilder().setCustomId('mb_page').setLabel('Page ' + (pageIdx + 1) + '/' + totalPages).setStyle(ButtonStyle.Secondary).setDisabled(true),
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

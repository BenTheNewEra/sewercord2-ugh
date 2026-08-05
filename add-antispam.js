const fs = require('fs');
let idx = fs.readFileSync('index.js', 'utf8');

// 1. Add anti-spam tracking system before the messageCreate handler
// Find the messageCreate line
const msgCreateLine = "client.on('messageCreate', async (message) => {";

const antiSpamCode = `// --- Anti-Spam System ---
const SPAM_WINDOW = 10000; // 10 seconds
const SPAM_THRESHOLD = 3; // 3 identical messages = spam
const SPAM_TIMEOUT_SECONDS = 60; // timeout for 1 minute on spam
const spamTracker = new Map(); // userId -> [{ content, timestamp, msgId }]

async function checkAntiSpam(message) {
  if (message.author.bot || !message.guild) return false;
  const userId = message.author.id;
  const now = Date.now();
  const content = message.content.trim().toLowerCase();

  // Skip empty messages and single-char/emoji spam (handled differently)
  if (!content || content.length < 2) return false;

  // Skip mods/admins (they can spam if they want)
  if (message.member && message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

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
      // Delete all identical messages
      for (const h of identical) {
        try {
          const msg = await message.channel.messages.fetch(h.msgId).catch(() => null);
          if (msg) await msg.delete().catch(() => {});
        } catch {}
      }

      // Clear the user's history so they start fresh
      spamTracker.set(userId, []);

      // Timeout the spammer
      try {
        const member = await message.guild.members.fetch(userId);
        if (member && member.moderatable) {
          await member.timeout(SPAM_TIMEOUT_SECONDS * 1000, 'Spamming identical messages');
        }
      } catch {}

      // Warn in channel
      await message.channel.send('<@' + userId + '>, stop spamming identical messages! You\\'ve been timed out for 60 seconds.').then(m => {
        setTimeout(() => m.delete().catch(() => {}), 5000);
      }).catch(() => {});

      return true; // spam detected, stop processing
    } catch (err) {
      console.error('Anti-spam error:', err);
    }
  }

  return false;
}

`;

if (!idx.includes('Anti-Spam System')) {
  idx = idx.replace(msgCreateLine, antiSpamCode + msgCreateLine);
  console.log('1. Anti-spam system added before messageCreate');
} else {
  console.log('1. Anti-spam already exists, skipping');
}

// 2. Add anti-spam check at the START of messageCreate handler
const handlerStart = `client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot || !message.guild) return;`;

const handlerStartWithSpam = `client.on('messageCreate', async (message) => {
  try {
    // Anti-spam check (runs for ALL messages, not just commands)
    if (await checkAntiSpam(message)) return;
    if (message.author.bot || !message.guild) return;`;

if (idx.includes(handlerStart) && !idx.includes('checkAntiSpam')) {
  idx = idx.replace(handlerStart, handlerStartWithSpam);
  console.log('2. Anti-spam check added to messageCreate handler');
} else {
  console.log('2. Anti-spam check already in handler or not found');
}

// 3. Add periodic cleanup of spam tracker (every 60 seconds, prune inactive users)
const readyHandler = "client.once('ready', () => {";
const readyWithCleanup = `client.once('ready', () => {
  // Clean up spam tracker periodically
  setInterval(() => {
    const now = Date.now();
    for (const [userId, history] of spamTracker.entries()) {
      if (history.length === 0 || now - history[history.length - 1].timestamp > 60000) {
        spamTracker.delete(userId);
      }
    }
  }, 60000);`;

if (!idx.includes('Clean up spam tracker')) {
  idx = idx.replace(readyHandler, readyWithCleanup);
  console.log('3. Spam tracker cleanup interval added');
} else {
  console.log('3. Cleanup interval already exists');
}

// 4. Update help text
idx = idx.replace(
  "{ name: 'Moderation', value: '/kick /ban /purge /timeout (.to) /setlog' },",
  "{ name: 'Moderation', value: '/kick /ban /purge /timeout (.to) /setlog' },\n      { name: 'Auto-Mod', value: 'Anti-spam: 3+ identical messages = auto-delete + 60s timeout' },"
);
console.log('4. Help text updated');

fs.writeFileSync('index.js', idx);
console.log('\nDone!');

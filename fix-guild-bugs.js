const fs = require('fs');
let idx = fs.readFileSync('index.js', 'utf8');

// ============================================================
// BUG 1: No GUILD_ID check in messageCreate
// If bot is added to another server, dot commands work there
// FIX: Ignore messages from other guilds
// ============================================================
const oldMsgHandler = `    if (await checkAntiSpam(message)) return;
    if (message.author.bot || !message.guild) return;`;

const newMsgHandler = `    if (await checkAntiSpam(message)) return;
    if (message.author.bot || !message.guild) return;
    // Only respond to commands in the configured guild
    if (GUILD_ID && message.guild.id !== GUILD_ID) return;`;

if (idx.includes(oldMsgHandler) && !idx.includes('Only respond to commands in the configured guild')) {
  idx = idx.replace(oldMsgHandler, newMsgHandler);
  console.log('BUG 1 FIXED: GUILD_ID check added to messageCreate');
} else {
  console.log('BUG 1: messageCreate check already present or not found');
}

// ============================================================
// BUG 2: No GUILD_ID check in interactionCreate
// Slash commands are guild-registered so this is belt-and-suspenders,
// but button interactions (mailbox, robbery) should also be restricted
// ============================================================
const oldInteractionHandler = `client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {`;

const newInteractionHandler = `client.on('interactionCreate', async (interaction) => {
  try {
    // Only respond to interactions in the configured guild
    if (GUILD_ID && interaction.guildId && interaction.guildId !== GUILD_ID) return;
    if (interaction.isChatInputCommand()) {`;

if (idx.includes(oldInteractionHandler) && !idx.includes('Only respond to interactions in the configured guild')) {
  idx = idx.replace(oldInteractionHandler, newInteractionHandler);
  console.log('BUG 2 FIXED: GUILD_ID check added to interactionCreate');
} else {
  console.log('BUG 2: interactionCreate check already present or not found');
}

// ============================================================
// BUG 3: MsgAdapter.reply ignores ephemeral flag for dot commands
// When permission denied message uses { content, ephemeral: true },
// dot commands show it publicly instead of privately.
// FIX: For dot commands, delete the reply after a few seconds if ephemeral was requested
// ============================================================
const oldReplyMethod = `  async reply(payload) {
    this._replied = true;
    await this._message.reply(payload);
  }`;

const newReplyMethod = `  async reply(payload) {
    this._replied = true;
    // Dot commands can't do ephemeral - simulate it by deleting after a few seconds
    const wantsEphemeral = typeof payload === 'object' && payload.ephemeral;
    if (wantsEphemeral && payload.content) {
      const sent = await this._message.reply({ content: payload.content });
      setTimeout(() => { try { sent.delete(); } catch {} }, 5000);
      return sent;
    }
    await this._message.reply(payload);
  }`;

if (idx.includes(oldReplyMethod) && !idx.includes('simulate it by deleting')) {
  idx = idx.replace(oldReplyMethod, newReplyMethod);
  console.log('BUG 3 FIXED: MsgAdapter.reply now handles ephemeral for dot commands');
} else {
  console.log('BUG 3: reply method already fixed or not found');
}

fs.writeFileSync('index.js', idx);
console.log('\nDone!');

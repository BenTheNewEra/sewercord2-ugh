// All-in-one patch: mailbox button + timeout command + permission checks
// Run: node patch-all.js
const fs = require('fs');

// ============ PATCH 1: Mailbox Mark Read button always shows ============
let idx = fs.readFileSync('index.js', 'utf8');

const oldMailbox = `  const components = [];
  if (totalPages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mb_prev:' + userId + ':' + pageIdx).setLabel('Prev').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx === 0),
      new ButtonBuilder().setCustomId('mb_page').setLabel('Page ' + (pageIdx + 1) + '/' + totalPages).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('mb_next:' + userId + ':' + pageIdx).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx >= totalPages - 1),
      new ButtonBuilder().setCustomId('mb_read:' + userId + ':' + pageIdx).setLabel('Mark Read').setStyle(ButtonStyle.Primary),
    ));
  }
  return { embed, components };`;

const newMailbox = `  const row = new ActionRowBuilder();
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
  return { embed, components: [row] };`;

if (idx.includes(oldMailbox)) {
  idx = idx.replace(oldMailbox, newMailbox);
  console.log('1. Mailbox: Mark Read button always shows');
} else if (idx.includes('const row = new ActionRowBuilder();\n  if (totalPages > 1)')) {
  console.log('1. Mailbox: already patched');
} else {
  console.log('1. Mailbox: WARNING - could not find target code');
}

// ============ PATCH 2: Timeout command (.to) ============
if (!idx.includes("to: ['user:user'")) {
  idx = idx.replace(
    "  purge: ['amount:int'],",
    "  purge: ['amount:int'],\n  to: ['user:user', 'duration:int', 'reason:rest?'],"
  );
}
if (!idx.includes("'to',")) {
  idx = idx.replace(
    "'kick', 'ban', 'purge', 'setlog',",
    "'kick', 'ban', 'purge', 'setlog', 'to',"
  );
}
if (!idx.includes("case 'to':")) {
  const tc = "    case 'timeout': case 'to': {\n      const target = interaction.options.getUser('user');\n      const duration = interaction.options.getInteger('duration');\n      const reason = interaction.options.getString('reason') || 'No reason provided';\n      if (!target) return interaction.reply('Please mention a user to timeout.');\n      if (!duration || duration < 1) return interaction.reply('Duration must be at least 1 second.');\n      try {\n        const member = await interaction.guild['members'].fetch(target.id);\n        await member.timeout(duration * 1000, reason);\n        const timeStr = duration >= 60 ? Math.floor(duration / 60) + ' min' : duration + ' sec';\n        return interaction.reply('Timed out <@' + target.id + '> for ' + timeStr + '. Reason: ' + reason);\n      } catch { return interaction.reply('Failed to timeout (need Moderate Members permission).'); }\n    }\n";
  idx = idx.replace("    case 'givecoins': {", tc + "    case 'givecoins': {");
  console.log('2. Timeout command (.to) added');
} else {
  console.log('2. Timeout: already patched');
}

// ============ PATCH 3: Permission checks for mod commands ============
if (!idx.includes('PermissionFlagsBits')) {
  idx = idx.replace(
    "  SlashCommandBuilder, Partials\n} = require('discord.js');",
    "  SlashCommandBuilder, Partials, PermissionFlagsBits\n} = require('discord.js');"
  );
}
if (!idx.includes('modPerms')) {
  const pc = "    const modPerms = {\n      kick: 'KickMembers',\n      ban: 'BanMembers',\n      purge: 'ManageMessages',\n      timeout: 'ModerateMembers',\n      to: 'ModerateMembers',\n    };\n    if (modPerms[commandName] && (!interaction.member || !interaction.member.permissions.has(PermissionFlagsBits[modPerms[commandName]]))) {\n      return interaction.reply({ content: 'You need the **' + modPerms[commandName] + '** permission to use this command.', ephemeral: true });\n    }\n\n";
  idx = idx.replace("    case 'kick': {", pc + "    case 'kick': {");
  console.log('3. Permission checks added');
} else {
  console.log('3. Permissions: already patched');
}

// Update help text
idx = idx.replace("'/kick /ban /purge /setlog'", "'/kick /ban /purge /timeout (.to) /setlog'");

fs.writeFileSync('index.js', idx);

// ============ PATCH 4: Register /timeout slash command ============
let reg = fs.readFileSync('register.js', 'utf8');
if (!reg.includes("setName('timeout')")) {
  const tcmd = "  new SlashCommandBuilder().setName('timeout').setDescription('Timeout a user').addUserOption(o => o.setName('user').setDescription('Who to timeout').setRequired(true)).addIntegerOption(o => o.setName('duration').setDescription('Duration in seconds').setRequired(true).setMinValue(1).setMaxValue(2419200)).addStringOption(o => o.setName('reason').setDescription('Reason')),\n";
  reg = reg.replace("  new SlashCommandBuilder().setName('setlog')", tcmd + "  new SlashCommandBuilder().setName('setlog')");
  fs.writeFileSync('register.js', reg);
  console.log('4. /timeout slash command registered');
} else {
  console.log('4. Register: already patched');
}

console.log('\nAll done! Now run:');
console.log('  git add -A');
console.log('  git commit -m "Mailbox button + timeout command + mod perms fix"');
console.log('  git push');
console.log('  node register.js  (to register the new /timeout slash command)');

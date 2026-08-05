const fs = require('fs');
let idx = fs.readFileSync('index.js', 'utf8');

// Remove the broken placement (inside switch, between mailbox case and kick case)
const brokenBlock = `    // --- Moderation permission checks ---
    const modPerms = {
      kick: 'KickMembers',
      ban: 'BanMembers',
      purge: 'ManageMessages',
      timeout: 'ModerateMembers',
      to: 'ModerateMembers',
    };
    if (modPerms[commandName] && (!interaction.member || !interaction.member.permissions.has(PermissionFlagsBits[modPerms[commandName]]))) {
      return interaction.reply({ content: 'You need the **' + modPerms[commandName] + '** permission to use this command.', ephemeral: true });
    }

`;

if (idx.includes(brokenBlock)) {
  idx = idx.replace(brokenBlock, '');
  console.log('Removed broken placement');
} else {
  // Try alternate version without the comment
  const brokenBlock2 = `    const modPerms = {
      kick: 'KickMembers',
      ban: 'BanMembers',
      purge: 'ManageMessages',
      timeout: 'ModerateMembers',
      to: 'ModerateMembers',
    };
    if (modPerms[commandName] && (!interaction.member || !interaction.member.permissions.has(PermissionFlagsBits[modPerms[commandName]]))) {
      return interaction.reply({ content: 'You need the **' + modPerms[commandName] + '** permission to use this command.', ephemeral: true });
    }

`;
  if (idx.includes(brokenBlock2)) {
    idx = idx.replace(brokenBlock2, '');
    console.log('Removed broken placement (alt)');
  } else {
    console.log('WARNING: could not find broken block');
  }
}

// Insert the permission check BEFORE the switch statement
const switchLine = '  switch (commandName) {';
const permCheck = `  // --- Moderation permission checks (before switch so it always runs) ---
  const modPerms = {
    kick: 'KickMembers',
    ban: 'BanMembers',
    purge: 'ManageMessages',
    timeout: 'ModerateMembers',
    to: 'ModerateMembers',
  };
  if (modPerms[commandName] && (!interaction.member || !interaction.member.permissions.has(PermissionFlagsBits[modPerms[commandName]]))) {
    return interaction.reply({ content: 'You need the **' + modPerms[commandName] + '** permission to use this command.', ephemeral: true });
  }

  switch (commandName) {`;

if (idx.includes(switchLine)) {
  idx = idx.replace(switchLine, permCheck);
  console.log('Inserted permission check before switch');
} else {
  console.log('ERROR: could not find switch line');
}

fs.writeFileSync('index.js', idx);
console.log('Done!');

require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const APP_ID = process.env.DISCORD_APP_ID;
const GUILD_IDS = (process.env.GUILD_ID || '').split(',').map(s => s.trim()).filter(Boolean);

const commands = [
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
    .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(10)),
  new SlashCommandBuilder().setName('pay').setDescription('Give coins to someone')
    .addUserOption(o => o.setName('user').setDescription('Who to pay').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('rob').setDescription('Rob another user (risky!)')
    .addUserOption(o => o.setName('user').setDescription('Who to rob').setRequired(true)),
  new SlashCommandBuilder().setName('shop').setDescription('View the shop'),
  new SlashCommandBuilder().setName('buy').setDescription('Buy an item from the shop')
    .addStringOption(o => o.setName('item').setDescription('What to buy').setRequired(true)
      .addChoices(
        { name: 'Rob Shield - 500 coins', value: 'shield' },
        { name: 'Lucky Charm - 300 coins', value: 'charm' },
        { name: 'XP Boost - 1000 coins', value: 'boost' },
        { name: 'Nickname - 250 coins', value: 'nickname' },
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
  new SlashCommandBuilder().setName('timeout').setDescription('Timeout a user').addUserOption(o => o.setName('user').setDescription('Who to timeout').setRequired(true)).addIntegerOption(o => o.setName('duration').setDescription('Duration in seconds').setRequired(true).setMinValue(1).setMaxValue(2419200)).addStringOption(o => o.setName('reason').setDescription('Reason')),
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
  new SlashCommandBuilder().setName('marry').setDescription('Propose to someone 💍').addUserOption(o => o.setName('user').setDescription('Who to propose to').setRequired(true)),
  new SlashCommandBuilder().setName('divorce').setDescription('Divorce your spouse 💔'),
].map(cmd => cmd.toJSON());

const rest = new REST().setToken(TOKEN);

(async () => {
  try {
    console.log('Registering ' + commands.length + ' commands...');
    for (const gid of GUILD_IDS) {
      const data = await rest.put(Routes.applicationGuildCommands(APP_ID, gid), { body: commands });
      console.log('Registered ' + data.length + ' commands to guild ' + gid);
    }
  } catch (err) {
    console.error('Failed:', err);
  }
})();

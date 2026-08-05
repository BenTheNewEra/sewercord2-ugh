// Run this once to register slash commands: node register.js

require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const APP_ID = process.env.DISCORD_APP_ID;
const GUILD_ID = process.env.GUILD_ID;

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check if bot is online'),
  new SlashCommandBuilder().setName('help').setDescription('Show all commands'),
  new SlashCommandBuilder().setName('bl').setDescription('Check your balance, level, and XP'),
  new SlashCommandBuilder().setName('daily').setDescription('Claim your daily reward'),
  new SlashCommandBuilder().setName('rank').setDescription('Show your server rank'),
  new SlashCommandBuilder().setName('lb').setDescription('View the leaderboard'),
  new SlashCommandBuilder().setName('mailbox').setDescription('View messages where you were mentioned'),

  // Work
  new SlashCommandBuilder().setName('work').setDescription('Work a job to earn coins (1h cooldown)')
    .addStringOption(o => o.setName('job').setDescription('Which job to work').setRequired(true)
      .addChoices(
        { name: 'Barista', value: 'barista' }, { name: 'Bartender', value: 'bartender' },
        { name: 'Chef', value: 'chef' }, { name: 'Programmer', value: 'programmer' },
        { name: 'Delivery', value: 'delivery' }, { name: 'Streamer', value: 'streamer' },
        { name: 'Artist', value: 'artist' }, { name: 'Mechanic', value: 'mechanic' },
        { name: 'Teacher', value: 'teacher' }, { name: 'DJ', value: 'dj' },
      )),

  // Gamble
  new SlashCommandBuilder().setName('gamble').setDescription('Gamble coins (50/50)')
    .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(10)),

  // Pay
  new SlashCommandBuilder().setName('pay').setDescription('Give coins to someone')
    .addUserOption(o => o.setName('user').setDescription('Who to pay').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),

  // Rob
  new SlashCommandBuilder().setName('rob').setDescription('Rob another user (risky!)')
    .addUserOption(o => o.setName('user').setDescription('Who to rob').setRequired(true)),

  // Shop & Buy
  new SlashCommandBuilder().setName('shop').setDescription('View the shop'),
  new SlashCommandBuilder().setName('buy').setDescription('Buy an item from the shop')
    .addStringOption(o => o.setName('item').setDescription('What to buy').setRequired(true)
      .addChoices(
        { name: 'Rob Shield — 500 coins', value: 'shield' },
        { name: 'Lucky Charm — 300 coins', value: 'charm' },
        { name: 'XP Boost — 1000 coins', value: 'boost' },
        { name: 'Nickname — 250 coins', value: 'nickname' },
      ))
    .addStringOption(o => o.setName('nickname').setDescription('New nickname (nickname item only)')),

  // Fun
  new SlashCommandBuilder().setName('roll').setDescription('Roll a dice').addIntegerOption(o => o.setName('sides').setDescription('Number of sides (default 6)').setMinValue(2).setMaxValue(1000)),
  new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin'),
  new SlashCommandBuilder().setName('8ball').setDescription('Ask the magic 8-ball').addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),
  new SlashCommandBuilder().setName('choose').setDescription('Let the bot choose').addStringOption(o => o.setName('options').setDescription('Comma-separated options').setRequired(true)),
  new SlashCommandBuilder().setName('cookie').setDescription('Give a cookie').addUserOption(o => o.setName('user').setDescription('Who to give it to')),
  new S

const fs = require('fs');
let idx = fs.readFileSync('index.js', 'utf8');
const oldCode = `  const components = [];
  if (totalPages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mb_prev:' + userId + ':' + pageIdx).setLabel('Prev').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx === 0),
      new ButtonBuilder().setCustomId('mb_page').setLabel('Page ' + (pageIdx + 1) + '/' + totalPages).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('mb_next:' + userId + ':' + pageIdx).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx >= totalPages - 1),
      new ButtonBuilder().setCustomId('mb_read:' + userId + ':' + pageIdx).setLabel('Mark Read').setStyle(ButtonStyle.Primary),
    ));
  }
  return { embed, components };`;
const newCode = `  const row = new ActionRowBuilder();
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
if (idx.includes(oldCode)) {
  idx = idx.replace(oldCode, newCode);
  fs.writeFileSync('index.js', idx);
  console.log('Patched - Mark Read button now always shows');
} else {
  console.log('Could not find target code - may already be patched or code changed');
}
console.log('Done! Run: git add -A && git commit -m "Always show Mark Read button" && git push');

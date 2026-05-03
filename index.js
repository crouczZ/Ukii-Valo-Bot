require('dotenv').config(); // Local test üçün .env faylını oxuyur
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const express = require('express');

// --- RENDER ÜÇÜN MƏCBURİ VEB SERVER ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Valorant Bot 7/24 Aktivdir!'));
app.listen(port, () => console.log(`🌐 Veb server ${port} portunda dinləyir (Render üçün)`));
// --------------------------------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Ayarları artıq Render-in Environment Variables hissəsindən alırıq
const TOKEN = process.env.TOKEN;
const KANAL_ID = process.env.KANAL_ID; 
const MVP_ROL_ID = process.env.MVP_ROL_ID; 

const DATA_FILE = './users.json';

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}));
}

client.once('ready', () => {
    console.log(`✅ Bot aktivdir: ${client.user.tag}`);

    // Hər Bazar günü saat 23:59-da avtomatik reytinqi yeniləmək üçün Cron
    cron.schedule('0 59 23 * * 0', () => {
        console.log('Avtomatik həftəlik reytinq hesablanır...');
        reytinqiYenile();
    });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!qeydiyyat')) {
        const args = message.content.split(' ');
        if (args.length < 2) {
            return message.reply('❌ Səhv format! Belə yazın: `!qeydiyyat Jett#TR1`');
        }

        const riotID = args[1].split('#');
        if (riotID.length !== 2) {
            return message.reply('❌ Səhv format! Ad və Tag arasında `#` olmalıdır.');
        }

        const users = JSON.parse(fs.readFileSync(DATA_FILE));
        users[message.author.id] = {
            name: riotID[0],
            tag: riotID[1],
            discordId: message.author.id
        };

        fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
        message.reply(`✅ Uğurla qeydiyyatdan keçdin: **${args[1]}**! Reytinq yenilənəndə statların çəkiləcək.`);
    }

    if (message.content === '!reytinq') {
        message.reply('⏳ Reytinq hesablanır, zəhmət olmasa gözləyin...');
        reytinqiYenile();
    }
});

async function reytinqiYenile() {
    const users = JSON.parse(fs.readFileSync(DATA_FILE));
    const userIDs = Object.keys(users);
    
    if (userIDs.length === 0) return console.log('Qeydiyyatdan keçən heç kim yoxdur.');

    let leaderboard = [];

    for (const id of userIDs) {
        const user = users[id];
        try {
            const res = await axios.get(`https://api.henrikdev.xyz/valorant/v1/mmr/eu/${user.name}/${user.tag}`);
            
            if (res.data.status === 200) {
                leaderboard.push({
                    discordId: user.discordId,
                    rank: res.data.data.currenttierpatched,
                    elo: res.data.data.elo 
                });
            }
        } catch (err) {
            console.log(`${user.name}#${user.tag} üçün API xətası.`);
        }
    }

    if (leaderboard.length === 0) return;

    leaderboard.sort((a, b) => b.elo - a.elo);

    const embed = new EmbedBuilder()
        .setTitle('🏆 Həftəlik Valorant Liderlik Lövhəsi')
        .setColor('#FF4655') 
        .setDescription('Serverimizin ən yaxşı oyunçuları!')
        .setTimestamp();

    let descriptionText = '';
    leaderboard.forEach((player, index) => {
        let medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🔹';
        descriptionText += `${medal} **<@${player.discordId}>** - ${player.rank}\n`;
    });
    
    embed.setDescription(descriptionText);

    const channel = client.channels.cache.get(KANAL_ID);
    if (channel) {
        channel.send({ embeds: [embed] });
        
        const guild = channel.guild;
        const mvpRole = guild.roles.cache.get(MVP_ROL_ID);
        
        if (mvpRole) {
            guild.members.cache.filter(m => m.roles.cache.has(mvpRole.id)).forEach(member => {
                member.roles.remove(mvpRole).catch(console.error);
            });

            const newMvp = guild.members.cache.get(leaderboard[0].discordId);
            if (newMvp) {
                newMvp.roles.add(mvpRole).catch(console.error);
                channel.send(`🎉 Bu həftənin MVP-si: <@${newMvp.id}>! Yeni rolun xeyirli olsun.`);
            }
        }
    }
}

// Botu Render-dəki gizli token ilə işə salırıq
client.login(TOKEN);

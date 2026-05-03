require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Valorant Bot 7/24 Aktivdir!'));
app.listen(port, () => console.log(`🌐 Veb server ${port} portunda dinləyir`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const TOKEN = process.env.TOKEN;
const KANAL_ID = process.env.KANAL_ID; 
const MVP_ROL_ID = process.env.MVP_ROL_ID; 
const DATA_FILE = './users.json';

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}));
}

client.once('ready', () => {
    console.log(`✅ Bot aktivdir: ${client.user.tag}`);
    cron.schedule('0 59 23 * * 0', () => {
        reytinqiYenile();
    });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // YENİ QEYDİYYAT SİSTEMİ (Region ilə)
    if (message.content.startsWith('!qeydiyyat')) {
        const args = message.content.split(' ');
        
        if (args.length < 3) {
            return message.reply('❌ Səhv format! Belə yazın: `!qeydiyyat eu Jett#TR1`\n*(Dəstəklənən regionlar: eu, tr, na, ap, kr)*');
        }

        let region = args[1].toLowerCase();
        // TR yazılarsa avtomatik EU-ya çeviririk (API belə işləyir)
        if (region === 'tr') region = 'eu';

        const validRegions = ['eu', 'na', 'ap', 'kr'];
        if (!validRegions.includes(region)) {
            return message.reply('❌ Səhv region! Yalnız bunları yaza bilərsiniz: `eu, tr, na, ap, kr`');
        }

        const riotID = args[2].split('#');
        if (riotID.length !== 2) {
            return message.reply('❌ Səhv format! Ad və Tag arasında `#` olmalıdır.');
        }

        const users = JSON.parse(fs.readFileSync(DATA_FILE));
        users[message.author.id] = {
            region: region,
            name: riotID[0],
            tag: riotID[1],
            discordId: message.author.id
        };

        fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
        message.reply(`✅ Uğurla qeydiyyatdan keçdin: **${args[2]}** (Region: ${region.toUpperCase()})!`);
    }

    if (message.content === '!reytinq') {
        const replyMsg = await message.reply('⏳ Reytinq hesablanır, zəhmət olmasa gözləyin...');
        // Mesajı funksiyaya göndəririk ki, işi bitəndə onu yeniləyə bilsin
        reytinqiYenile(replyMsg); 
    }
});

// Artıq xətaları birbaşa sənə Discord-da yazacaq
async function reytinqiYenile(triggerMessage = null) {
    const users = JSON.parse(fs.readFileSync(DATA_FILE));
    const userIDs = Object.keys(users);
    
    if (userIDs.length === 0) {
        if (triggerMessage) return triggerMessage.edit('❌ Qeydiyyatdan keçən heç kim yoxdur! Əvvəlcə `!qeydiyyat` komandasından istifadə edin.');
        return;
    }

    let leaderboard = [];
    let xetalilar = []; // Hesabı tapılmayanları bura yığacağıq

    for (const id of userIDs) {
        const user = users[id];
        try {
            // API sorğusu artıq istifadəçinin qeydiyyatdan keçdiyi regiona görə gedir
            const res = await axios.get(`https://api.henrikdev.xyz/valorant/v1/mmr/${user.region}/${user.name}/${user.tag}`);
            
            if (res.data.status === 200 && res.data.data.elo !== null) {
                leaderboard.push({
                    discordId: user.discordId,
                    rank: res.data.data.currenttierpatched,
                    elo: res.data.data.elo 
                });
            } else {
                xetalilar.push(`${user.name}#${user.tag} (Rankı yoxdur)`);
            }
        } catch (err) {
            xetalilar.push(`${user.name}#${user.tag} (Gizli hesab/API xətası)`);
        }
    }

    if (leaderboard.length === 0) {
        if (triggerMessage) return triggerMessage.edit(`❌ Heç bir oyunçunun məlumatını çəkmək mümkün olmadı.\n**Səbəblər:** Hesablar gizli ola bilər və ya bu sezon heç rank oynanmayıb.\n*Xəta verən hesablar:* ${xetalilar.join(', ')}`);
        return;
    }

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
    
    // Əgər bəzi hesablar tapılmayıbsa, cədvəlin altına məlumat olaraq əlavə edirik
    if (xetalilar.length > 0) {
        descriptionText += `\n⚠️ *Tapılmayan hesablar:* ${xetalilar.join(', ')}`;
    }

    embed.setDescription(descriptionText);

    // Kanalı yoxlayırıq
    const channel = client.channels.cache.get(KANAL_ID);
    if (!channel) {
        if (triggerMessage) return triggerMessage.edit(`❌ **DİQQƏT:** Məlumatlar çəkildi, amma \`KANAL_ID\` səhvdir və ya bot o kanalı görmür! Render-də ID-ni yoxlayın.\n\n**Hazırki Reytinq:**\n${descriptionText}`);
        return;
    }

    // Hər şey qaydasındadırsa kanala göndər
    channel.send({ embeds: [embed] });
    
    // "Hesablanır..." mesajını sil
    if (triggerMessage) triggerMessage.delete().catch(()=>{});
    
    // Rolvermə əməliyyatı
    if (MVP_ROL_ID) {
        const guild = channel.guild;
        const mvpRole = guild.roles.cache.get(MVP_ROL_ID);
        
        if (mvpRole) {
            guild.members.cache.filter(m => m.roles.cache.has(mvpRole.id)).forEach(member => {
                member.roles.remove(mvpRole).catch(() => {});
            });

            const newMvp = guild.members.cache.get(leaderboard[0].discordId);
            if (newMvp) {
                newMvp.roles.add(mvpRole).catch(() => {});
                channel.send(`🎉 Bu həftənin MVP-si: <@${newMvp.id}>!`);
            }
        }
    }
}

client.login(TOKEN);

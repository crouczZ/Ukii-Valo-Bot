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
    let xetalilar = [];

    for (const id of userIDs) {
        const user = users[id];
        try {
            const res = await axios.get(`https://api.henrikdev.xyz/valorant/v1/mmr/${user.region}/${user.name}/${user.tag}`);

            // API düzgün cavab verirsə və elo dəyəri mövcuddursa
            if (res.data.status === 200 && res.data.data && res.data.data.elo !== null) {
                leaderboard.push({
                    discordId: user.discordId,
                    rank: res.data.data.currenttierpatched,
                    elo: res.data.data.elo
                });
            } else {
                xetalilar.push(`${user.name}#${user.tag} (Hesab tapıldı, lakin Rank/Elo mövcud deyil)`);
            }
        } catch (err) {
            // Xətanın əsl səbəbini tapmaq üçün detallı analiz
            let xetaSebebi = 'Bilinməyən Xəta';
            if (err.response) {
                // API cavab verib, amma xəta kodu ilə (məsələn, 404, 403, 429)
                xetaSebebi = `Status ${err.response.status}: ${err.response.data?.message || err.response.data?.errors?.[0]?.message || 'Səbəb göstərilməyib'}`;
            } else if (err.request) {
                // API ümumiyyətlə cavab verməyib (Render bloklanıb və ya Timeout)
                xetaSebebi = 'API-yə qoşulmaq mümkün olmadı (IP Bloklanması və ya Serverin cavab verməməsi)';
            } else {
                xetaSebebi = err.message;
            }
            xetalilar.push(`${user.name}#${user.tag} (${xetaSebebi})`);
        }
    }

    if (leaderboard.length === 0) {
        if (triggerMessage) return triggerMessage.edit(`❌ Heç bir oyunçunun məlumatını çəkmək mümkün olmadı.\n\n⚠️ **Sistemin verdiyi xətalar:**\n${xetalilar.join('\n')}\n\n*Qeyd: Əgər xəta 'Status 403' və ya 'IP Blok' verirsə, bu Render-in API tərəfindən bloklandığını göstərir.*`);
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

    if (xetalilar.length > 0) {
        descriptionText += `\n\n⚠️ **Tapılmayan/Xəta verən hesablar:**\n${xetalilar.join('\n')}`;
    }

    embed.setDescription(descriptionText);

    const channel = client.channels.cache.get(KANAL_ID);
    if (!channel) {
        if (triggerMessage) return triggerMessage.edit(`❌ **DİQQƏT:** Məlumatlar çəkildi, amma \`KANAL_ID\` səhvdir! Render-də ID-ni yoxlayın.\n\n**Hazırki Reytinq:**\n${descriptionText}`);
        return;
    }

    channel.send({ embeds: [embed] });
    if (triggerMessage) triggerMessage.delete().catch(()=>{});

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

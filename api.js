const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fetchManga = require('./fetchManga');
const fetchChapter = require('./fetchChapter');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const sender = event.sender.id;

      if (event.message && event.message.text) {
        const text = event.message.text;
        const chapterMatch = text.match(/(?:الفصل|chapter)?\\s*(\\d+)/i);
        const mangaName = text.replace(/الفصل\\s*\\d+/i, '').trim();

        if (chapterMatch) {
          const chapterNum = chapterMatch[1];
          const images = await fetchChapter(mangaName, chapterNum);
          for (const img of images) {
            await sendImage(sender, img);
          }
          await sendText(sender, `📘 الفصل التالي: ${parseInt(chapterNum) + 1}`);
        } else {
          const info = await fetchManga(mangaName);
          const buttons = Array.from({ length: Math.min(5, info.totalChapters) }, (_, i) => ({
            type: 'postback',
            title: `الفصل ${i + 1}`,
            payload: `CHAPTER_${i + 1}_${mangaName}`
          }));
          await sendCard(sender, info, buttons);
        }
      } else if (event.postback && event.postback.payload.startsWith('CHAPTER_')) {
        const [, chap, name] = event.postback.payload.split('_');
        const images = await fetchChapter(name, chap);
        for (const img of images) {
          await sendImage(sender, img);
        }
        await sendText(sender, `📘 الفصل التالي: ${parseInt(chap) + 1}`);
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

async function sendText(sender, text) {
  await axios.post(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_TOKEN}`, {
    recipient: { id: sender },
    message: { text }
  });
}

async function sendImage(sender, url) {
  await axios.post(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_TOKEN}`, {
    recipient: { id: sender },
    message: {
      attachment: {
        type: 'image',
        payload: { url, is_reusable: true }
      }
    }
  });
}

async function sendCard(sender, info, buttons) {
  await axios.post(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_TOKEN}`, {
    recipient: { id: sender },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: [{
            title: info.title,
            image_url: info.cover,
            subtitle: info.description + '\\n📚 ' + info.genres,
            buttons
          }]
        }
      }
    }
  });
}

module.exports = app;

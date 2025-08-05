const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Webhook verify
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

// Webhook post
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const sender = event.sender.id;

      if (event.message && event.message.text) {
        const text = event.message.text.trim();
        const chapterMatch = text.match(/(?:الفصل|chapter)?\s*(\d+)/i);
        const mangaName = text.replace(/الفصل\s*\d+/i, '').trim();

        if (chapterMatch) {
          const chapterNum = chapterMatch[1];
          const images = await fetchChapter(mangaName, chapterNum);
          if (images.length === 0) {
            await sendText(sender, `❌ لم يتم العثور على الفصل ${chapterNum} للمانجا "${mangaName}".`);
          } else {
            for (const img of images) await sendImage(sender, img);
            await sendText(sender, `📘 الفصل التالي: ${parseInt(chapterNum) + 1}`);
          }
        } else {
          const info = await fetchManga(mangaName);
          await sendCard(sender, info);
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// ========== إرسال رسائل ==========

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

async function sendCard(sender, info) {
  if (!info.cover) {
    return sendText(sender, `❌ لم يتم العثور على المانجا "${info.title}".`);
  }

  const message = `📖 ${info.title}\n\n${info.description}\n\n📚 التصنيفات: ${info.genres}\n📘 عدد الفصول: ${info.totalChapters}\n\n✏️ لعرض صور فصل، اكتب مثلًا:\n"${info.title} الفصل 1"`;

  await sendImage(sender, info.cover);
  await sendText(sender, message);
}

// ========== جلب معلومات المانجا ==========

async function fetchManga(title) {
  try {
    const searchUrl = `https://www.onma.top/search`;
    const { data: searchHTML } = await axios.get(searchUrl, {
      params: { keyword: title },
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const $search = cheerio.load(searchHTML);
    const link = $search('.media-heading a').attr('href');
    if (!link) return { title, cover: '', description: '❌ لم يتم العثور على المانجا', genres: '', totalChapters: 0 };

    const { data: pageHTML } = await axios.get(link);
    const $ = cheerio.load(pageHTML);

    const titleText = $('div.panel-heading').text().trim();
    const cover = $('.boxed img').attr('src') || '';
    const description = $('.managa-summary .well p').text().trim();
    const genres = [];
    $('h3:contains("التصنيفات")').next('.text').find('a').each((i, el) => {
      genres.push($(el).text().trim());
    });
    const chapters = $('ul.chapters li h5 a');
    const totalChapters = chapters.length;

    return {
      title: titleText || title,
      cover,
      description,
      genres: genres.join(', '),
      totalChapters,
      link
    };
  } catch (err) {
    return { title, cover: '', description: '⚠️ حدث خطأ أثناء جلب البيانات', genres: '', totalChapters: 0 };
  }
}

// ========== جلب صور الفصل ==========

async function fetchChapter(mangaName, chapterNumber) {
  try {
    const searchUrl = `https://www.onma.top/search`;
    const { data: searchHTML } = await axios.get(searchUrl, {
      params: { keyword: mangaName },
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const $search = cheerio.load(searchHTML);
    const mangaLink = $search('.media-heading a').attr('href');
    if (!mangaLink) return [];

    const { data: mangaHTML } = await axios.get(mangaLink);
    const $manga = cheerio.load(mangaHTML);

    const chapterLinks = [];
    $manga('ul.chapters li h5 a').each((_, el) => {
      const href = $manga(el).attr('href');
      const text = $manga(el).text().trim();
      chapterLinks.push({ text, href });
    });

    const chapter = chapterLinks.find(ch => ch.text.includes(chapterNumber));
    if (!chapter) return [];

    const { data: chapHTML } = await axios.get(chapter.href);
    const $chap = cheerio.load(chapHTML);

    const images = [];
    $chap('img').each((_, img) => {
      const src = $chap(img).attr('src');
      if (src && src.includes('/uploads/')) images.push(src);
    });

    return images;
  } catch (e) {
    return [];
  }
}

module.exports = app;

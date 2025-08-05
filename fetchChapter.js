const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function fetchChapter(mangaName, chapterNumber) {
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
};

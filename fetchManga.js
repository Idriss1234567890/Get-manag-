const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function fetchManga(title) {
  try {
    const searchUrl = `https://www.onma.top/search`;
    const { data: searchHTML } = await axios.get(searchUrl, {
      params: { keyword: title },
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
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

    const status = $('h3:contains("الحالة") .text .label').text().trim();
    const author = $('h3:contains("المؤلف") .text').text().trim();

    const chapters = $('ul.chapters li h5 a');
    const totalChapters = chapters.length;

    return {
      title: titleText,
      cover,
      description,
      genres: genres.join(', '),
      author,
      status,
      totalChapters,
      link
    };
  } catch (err) {
    return { title, cover: '', description: '⚠️ حدث خطأ أثناء جلب البيانات', genres: '', totalChapters: 0 };
  }
};

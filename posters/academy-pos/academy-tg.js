
require("dotenv").config();

async function tg_post_academy() {

const { Telegraf } = require("telegraf");
const { initializeDatabase, closeDatabase, findRandomUnpostedDocument, removeOldDocumentsFromDb, deleteIfPostedAcademyCollectionHasReachedCountThreshold, deleteAllPostedJobsFromDbNow, addDocumentToPostedDb } = require('./academy-db-posts.js');

    try {

        await initializeDatabase();
        await removeOldDocumentsFromDb();
        await deleteIfPostedAcademyCollectionHasReachedCountThreshold();

        const bot = new Telegraf (process.env.TELEGRAM_BOT_TOKEN) //process.env.TELEGRAM_BOT_TOKEN
        const TELEGRAM_CHANNEL_ID =  process.env.TELEGRAM_CHANNEL_ID //process.env.TELEGRAM_CHANNEL_ID

        let scholarshipObj, post;


        try {

                    scholarshipObj = await findRandomUnpostedDocument();

                    if (scholarshipObj == null) {
                        await deleteAllPostedJobsFromDbNow();
                        scholarshipObj = await findRandomUnpostedDocument();
                    }


                    //limit 400 characters if length>400; remove employer
                    let title;

                    if (/\bPhD\b/i.test(scholarshipObj.post_title) == true || /\bdoctoral\b/i.test(scholarshipObj.post_title) == true) {
                        title = `<b>FULLY FUNDED PHD PROGRAM</b>\n\n`; console.log(`phd post title: `,scholarshipObj.post_title);
                    } else {
                       title = `<b>FULLY FUNDED POSITION</b>\n\n`; console.log(`no phd post title: `, scholarshipObj.post_title);
                    }

                    post = `${title}<b>${scholarshipObj.
                        post_title}</b>\n\n<b>Field:</b> ${scholarshipObj.field}\n\n\n\n🔰 <b>Institution:</b> ${scholarshipObj.institution}\n\n🔰 <b>Deadline:</b> ${scholarshipObj.
                        application_deadline}\n\n\n\n${scholarshipObj.application_link}`

                    await bot.telegram.sendMessage(TELEGRAM_CHANNEL_ID, post, {
                      parse_mode: "HTML",
                      disable_web_page_preview: true,
                     }); post = null;

                    console.log('post sent successfully!');
                    await addDocumentToPostedDb(scholarshipObj);
                    //console.log(post)
                    console.log('post added to posted-tg-jobs db..');

                } catch (error) {
                      console.error(error.message);
                    }


    await closeDatabase();
    return;

    } catch (error) {
        console.error("possible API error:", error.message);
        process.exit(1);
    }
};

//tg_post_academy();
module.exports = { tg_post_academy };

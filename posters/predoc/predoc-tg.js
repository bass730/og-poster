
require("dotenv").config();

async function tg_post_predoc () {

const { Telegraf } = require("telegraf");
const { initializeDatabase, closeDatabase, findRandomUnpostedDocument, removeOldDocumentsFromDb, deleteIfPostedPredocCollectionHasReachedCountThreshold, deleteAllPostedJobsFromDbNow, addDocumentToPostedDb } = require('./predoc-db-posts.js');

    try {

        await initializeDatabase();
        await removeOldDocumentsFromDb();
        await deleteIfPostedPredocCollectionHasReachedCountThreshold();

        const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)
        const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID

        let scholarshipObj, post;


        try {

                    scholarshipObj = await findRandomUnpostedDocument();

                    if (scholarshipObj == null) {
                        await deleteAllPostedJobsFromDbNow();
                        scholarshipObj = await findRandomUnpostedDocument();
                    }


                    //limit 400 characters if length>400; remove employer
                    post = `<b>FULLY FUNDED GRADUATE POSITION</b>\n\n<b>${scholarshipObj.
                        body}</b>\n\n🔰 <b>Deadline:</b> ${scholarshipObj.
                       deadline}\n\n${scholarshipObj.app_link}`

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

//tg_post_predoc();
module.exports = { tg_post_predoc };

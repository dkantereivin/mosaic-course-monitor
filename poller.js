#!/usr/bin/node
const puppeteer = require('puppeteer');
const dotenv = require('dotenv');
const fs = require('fs');
const axios = require('axios');

dotenv.config();

const ENTRY_URL = 'https://csprd.mcmaster.ca/psc/prcsprd/EMPLOYEE/SA/c/SA_LEARNER_SERVICES.SSR_SSENRL_CART.GBL';

function countOccurences(text, keyword) {
    return text.split(keyword).length - 1;
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const selectors = { // DOM selectors. Note: must include # for IDs!
    usernameTextField: '#userid',
    passwordTextField: '#pwd',
    winterTermRadioButton: '[id="SSR_DUMMY_RECV1$sels$1$$0"]',
    termSelectContinueButton: '#DERIVED_SSS_SCT_SSR_PB_GO',
    courseSearchButton: '#DERIVED_REGFRM1_SSR_PB_SRCH',
    subjectTextField: '[id="SSR_CLSRCH_WRK_SUBJECT$0"]',
    subjectWaitForText: '[id="SUBJECT_TBL_DESCR$0"]',
    courseNumberTextField: '[id="SSR_CLSRCH_WRK_CATALOG_NBR$1"]',
    classSearchButton: '#CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH',
    searchResultsHeader: '#DERIVED_REGFRM1_TITLE1',
    openImageSrc: '/cs/prcsprd/cache/PS_CS_STATUS_OPEN_ICN_1.gif',
    openImageSrcSelector: '[src="/cs/prcsprd/cache/PS_CS_STATUS_OPEN_ICN_1.gif"'
};

async function runScraper() {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: process.env.RUN_HEADLESS === 'true'
    });
    const incognito = await browser.createIncognitoBrowserContext();
    const page = await incognito.newPage();
    await page.goto(ENTRY_URL, {waitUntil: 'load'});
    
    await page.type(selectors.usernameTextField, process.env.MOSAIC_USERNAME);
    await page.type(selectors.passwordTextField, process.env.MOSAIC_PASSWORD);
    await page.keyboard.press('Enter');

    await page.waitForNavigation({waitUntil: 'load'});
    await page.click(selectors.winterTermRadioButton);
    await page.click(selectors.termSelectContinueButton);

    await page.waitForNavigation({waitUntil: 'load'});
    await page.click(selectors.courseSearchButton);

    await page.waitForSelector(selectors.subjectTextField);
    await page.type(selectors.subjectTextField, process.env.COURSE_SUBJECT);
    await page.type(selectors.courseNumberTextField, process.env.COURSE_NUMBER);
    await sleep(1000);
    await page.click(selectors.classSearchButton);


    await page.waitForSelector(selectors.openImageSrcSelector);
    await sleep(1000);


    // results page loaded
    const results = await page.content();
    
    fs.writeFileSync('snapshot.html', results);
    const ss = await page.screenshot({
        fullPage: true,
        path: 'snapshot.png'
    });
    const openIcons = countOccurences(results, selectors.openImageSrc);
    
    const openSections = openIcons - 1;

    if (openSections <= 0) {
        console.log('Check complete -- no message.');
        await browser.close();
        return;
    }
    
     // notify if open sections
    const pings = process.env.NOTIFY_IDS.split(',').map(id => `<@${id}>`);
    await axios.post(process.env.DISCORD_WEBHOOK, {
        content: 
        `${pings.join(' ')} it's go time homies... currently there are **${openSections}** open sections ` +
        `of ${process.env.COURSE_SUBJECT + ' ' + process.env.COURSE_NUMBER}`
    });
    console.log('Check complete -- message sent.');

    incognito.close();
    browser.close();
}


function runAndCatch() {
    runScraper()
    .catch(err => {
        axios.post(process.env.DISCORD_WEBHOOK, {
            content: err.toString()
        });
        console.error(err);
        process.exit(0);
    })
}

runAndCatch();
setTimeout(process.exit, 120000);

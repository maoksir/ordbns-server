const axios = require('axios')

const ORD_URL = 'https://turbo.ordinalswallet.com'
const child_process = require('child_process')

const fs = require('fs')

const STORAGE_FILE = './lowest-bns.json'
async function getInscriptions({ offset }) {
    const res = await axios.get(`${ORD_URL}/inscriptions`, {
        params: {
            offset
        }
    })
    return res.data
}

let storage
if (!fs.existsSync(STORAGE_FILE)) {
    storage = {}
} else {
   storage = JSON.parse(fs.readFileSync(STORAGE_FILE))
}
if (!storage.lowestBns) {
    storage.lowestBns = {}
}

if (!storage.latestOffset) {
    storage.latestOffset = 0
}

function updateGithub() {
    child_process.execSync('git add .')
    try {
        child_process.execSync('git commit -m "auto-update"')
    } catch(err) {
        console.log('Probably no changes')
        return
    }
    child_process.execSync('git push origin')
}

async function processBatch(inscriptions) {
    const textInscriptions = inscriptions.filter(it => it.content_type === 'text/plain;charset=utf-8')
    const promises = textInscriptions.map(async (it) => {
        const res = await axios.get(`${ORD_URL}/inscription/content/${it.id}`)
        return {
            data: res.data,
            inscription: it
        }
    })
    const results = await Promise.all(promises)
	const pattern = /^\d{1,3}\.btc$/
    for (const result of results) {
        const text = result.data
        const it = result.inscription
        if (pattern.test(text)) {
            console.log(`\n\n\n~~~~~~~~~~\n\n\nFound BNS: ${text}\n\n\n~~~~~~~~~~\n\n\n`)
            if (!storage.lowestBns[text] || it.num < storage.lowestBns[text].num) {
                storage.lowestBns[text] = {
                    id: it.id,
                    num: it.num
                }
            }
            fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2))
        }
    }
}

function markFullyIndexed(topInscriptionNum) {
    console.log(`Fully indexed. Top inscriptionNum is ${topInscriptionNum}`)
    storage.syncedToNum = topInscriptionNum
    storage.latestOffset = 0
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2))
    updateGithub()
}

let topInscriptionNum
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function run() {
    let inscriptions = await getInscriptions({ offset: storage.latestOffset })
    let currentInscriptionNum = inscriptions[0].num
    topInscriptionNum = currentInscriptionNum
    console.log(`Top inscriptionNum is ${topInscriptionNum}`)
    while(currentInscriptionNum > 0) {
        console.log(currentInscriptionNum)
        let nextInscriptions
        try {
            nextInscriptions = await getInscriptions({ offset: storage.latestOffset })
        } catch(err) {
            console.log(err)
            await delay(2000)
            continue
        }
        //console.log(nextInscriptions)
        if (nextInscriptions.length === 0) {
            markFullyIndexed(topInscriptionNum)
            break
        }
        currentInscriptionNum = nextInscriptions[0].num
        await processBatch(nextInscriptions)

        if (storage.syncedToNum && nextInscriptions[0].num < storage.syncedToNum) {
            // we've reached a point where we've already synced.
            markFullyIndexed(topInscriptionNum)
            break
        }

        fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2))
        storage.latestOffset += nextInscriptions.length
    }
}

run()
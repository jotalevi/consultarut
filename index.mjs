import * as jsdom from 'jsdom';
import express from'express';
import * as fs from 'fs';
import iconv from 'iconv-lite';


const app = express()
const port = 3414

let cached = {}

const solveCaptch = async () => {
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");
    
    const urlencoded = new URLSearchParams();
    urlencoded.append("oper", "0");

    const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: urlencoded,
    redirect: "follow"
    };

    let data = JSON.parse(await (await fetch("https://zeus.sii.cl/cvc_cgi/stc/CViewCaptcha.cgi", requestOptions)).text())
    data.solve = atob(data.txtCaptcha).slice(36, 40)

    return {
        solve: data.solve,
        txtCaptcha: data.txtCaptcha
    }
}

const decodeResponse = async (response) => {
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
};

const fetchData = async (captchaData, rut) => {
    const [run, dv] = rut.split('-');

    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");

    const urlencoded = new URLSearchParams();
    urlencoded.append("RUT", run);
    urlencoded.append("DV", dv);
    urlencoded.append("PRG", "STC");
    urlencoded.append("OPC", "NOR");
    urlencoded.append("txt_code", captchaData.solve);
    urlencoded.append("txt_captcha", captchaData.txtCaptcha);

    const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: urlencoded,
        redirect: "follow"
    };

    const response = await fetch("https://zeus.sii.cl/cvc_cgi/stc/getstc", requestOptions);

    // Detect encoding from headers
    const contentType = response.headers.get("content-type") || "";
    const encodingMatch = contentType.match(/charset=([^;]+)/i);
    const encoding = encodingMatch ? encodingMatch[1].toLowerCase() : "utf-8"; // Default to UTF-8

    const buffer = await response.arrayBuffer();

    // Decode using the detected encoding
    const html = iconv.decode(Buffer.from(buffer), encoding);

    return html;
};


const main = async (rut) => {  
    let captchaData = await solveCaptch()
    let data = await fetchData(captchaData, rut)

    const dom = new jsdom.JSDOM(data);
    const doc = dom.window.document;

    let razonSocialNode = doc.evaluate('//*[@id="contenedor"]/div[4]', doc, null, dom.window.XPathResult.FIRST_ORDERED_NODE_TYPE, null)._value.nodes[0].textContent;

    return razonSocialNode
}

const syncCache = () => {
    try {
        // Convert cached object to JSON, then to a Base64 string
        const cacheData = JSON.stringify(cached);
        const encodedCache = Buffer.from(cacheData, 'utf-8').toString('base64');
        fs.writeFileSync('cache', encodedCache, 'utf-8');
    } catch (error) {
        console.error("Error while syncing cache:", error.message);
    }
};

const loadCache = () => {
    try {
        // Read Base64 encoded cache, decode to UTF-8, and parse to JSON
        const encodedCache = fs.readFileSync('cache', 'utf-8');
        const cacheData = Buffer.from(encodedCache, 'base64').toString('utf-8');
        cached = JSON.parse(cacheData);
    } catch (error) {
        console.log("No cache file found or invalid cache format:", error.message);
        cached = {}; // Initialize an empty cache if loading fails
    }
};

app.get('/', async (req, res) => {
    let rut = req.query.rut.toUpperCase()

    try {
        if (cached[rut]) {
            res.json({rut: rut, name:cached[rut]})   
        }else {
            let result = await main(rut)
            cached[rut] = result

            syncCache()

            res.json({rut: rut, name: result})
        }
    }catch (error) {
        console.log(error)
        res.json({error: error.message})
    }
})

app.listen(port, () => {
    loadCache()
    console.log(`Example app listening on port ${port}`)
})

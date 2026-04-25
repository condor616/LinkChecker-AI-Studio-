
const regex = /\/printable\/print(\/|$)/;
const testUrls = [
    "novartis.com/node/667996/printable/print",
    "novartis.com/node/667996/printable/print/",
    "novartis.com/node/667996/printable/print/more",
    "https://www.novartis.com/node/667996/printable/print",
    "novartis.com/news/print-media",
    "novartis.com/sprint"
];

testUrls.forEach(url => {
    console.log(`${url}: ${regex.test(url)}`);
});

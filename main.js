// main.js
/**
 * Autor: Paweł Sołtys
 * Data: 2023-07-28
 */

// Importowanie modułów node.js
const { app, BrowserWindow } = require('electron')
const express = require('express')
const sql = require('mssql')
const path = require('path');
const cors = require('cors')
const zlib = require('zlib');

// Stworzenie serwera Express.js na porcie 3000
const server = express()
const port = 3000

const secret = require('./secret.js'); // Importowanie poufnych danych, takich jak nazwa użytkownika i hasło do bazy danych

// Konfiguracja połączenia do bazy danych
const config = {
    user: secret.database.user,
    password: secret.database.password,
    server: secret.database.server,
    database: secret.database.database,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
}
const configSOD = {
    user: secret.database.user,
    password: secret.database.password,
    server: secret.database.server,
    database: secret.database.databaseSOD,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
}
const configSODImages = {
    user: secret.database.user,
    password: secret.database.password,
    server: secret.database.server,
    database: secret.database.databaseSODImages,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
}
// Nawiązanie połączenia z bazą danych
// sql.connect(config).catch(err => console.error('initial connection error', err))
const pool = new sql.ConnectionPool(config);
pool.connect().catch(err => console.error('initial connection error', err))

// Nawiązanie połączenia z drugą bazą danych
const poolSOD = new sql.ConnectionPool(configSOD);
poolSOD.connect().catch(err => console.error('initial connection error', err))
const poolSODImages = new sql.ConnectionPool(configSODImages);
poolSODImages.connect().catch(err => console.error('initial connection error', err))
server.use(cors()) // Użycie modułu CORS dla poprawnej komunikacji między serwerem a klientem

// Obsługa zapytań GET do serwera, ścieżka '/data/:year/:type'
server.get('/data/:year/:type', async (req, res) => {
    const year = req.params.year;
    const type = req.params.type;
    let query = '';
    if (type === 'monthly') {
        // Miesięczne zapytanie
        query = `
            SELECT nag.TrN_TrNSeria AS Seria, nag.TrN_VatMiesiac AS Miesiac, SUM(elem.TrE_WartoscPoRabacie) AS Kwota
            FROM CDN.TraElem AS elem
            LEFT JOIN CDN.TraNag AS nag
            ON elem.TrE_GIDNumer = nag.TrN_GIDNumer
            WHERE nag.TrN_VatRok = ${year} AND nag.TrN_TrNSeria IN ('BEST', 'LAUF', 'SWG')
            GROUP BY nag.TrN_TrNSeria, nag.TrN_VatMiesiac
        `;
    } else if (type === 'weekly') {
        // Tygodniowe zapytanie
        query = `
            SELECT
                nag.TrN_TrNSeria AS Seria,
                DATEPART(ISO_WEEK, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)) AS Tydzien,
                SUM(elem.TrE_WartoscPoRabacie) AS Kwota
            FROM
                CDN.TraElem AS elem
                LEFT JOIN CDN.TraNag AS nag
                ON elem.TrE_GIDNumer = nag.TrN_GIDNumer
            WHERE
                nag.TrN_VatRok = ${year} AND nag.TrN_TrNSeria IN ('BEST', 'LAUF', 'SWG')
            GROUP BY
                nag.TrN_TrNSeria,
                DATEPART(ISO_WEEK, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien))
            ORDER BY
                Tydzien
        `;
    } else if (type === 'yearly') {
        // Roczne zapytanie
        query = `
            SELECT nag.TrN_TrNSeria AS Seria, nag.TrN_VatRok AS Rok, SUM(elem.TrE_WartoscPoRabacie) AS Kwota
            FROM CDN.TraElem AS elem
            LEFT JOIN CDN.TraNag AS nag
            ON elem.TrE_GIDNumer = nag.TrN_GIDNumer
            WHERE nag.TrN_TrNSeria IN ('BEST', 'LAUF', 'SWG')
            GROUP BY nag.TrN_TrNSeria, nag.TrN_VatRok
            ORDER BY Rok DESC
        `;
    } else {
        res.status(400).send('Invalid type. It should be either "monthly", "weekly" or "yearly".');
        return;
    }
    try {
        const result = await pool.query(query)
        res.json(result.recordset)
    } catch (err) {
        console.error(err)
        res.status(500).send(err.message)
    }
})
// Obsługa zapytań GET do serwera, ścieżka '/orders/:year/:type'
server.get('/orders/:year/:type', async (req, res) => {
    const year = req.params.year;
    const type = req.params.type;
    let query = '';
    if (type === 'monthly') {
        // Miesięczne zapytanie
        query = `
            SELECT ZaN_ZamSeria AS Seria,
                   MONTH(DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01')) AS Miesiac,
                   SUM(ZaE_Ilosc*ZaE_CenaUzgodniona) AS Kwota
            FROM cdn.ZamElem AS elem
            LEFT JOIN cdn.ZamNag AS nag ON elem.ZaE_GIDNumer = nag.ZaN_GIDNumer
            WHERE YEAR(DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01')) = ${year}
            AND ZaN_ZamSeria IN ('BEST', 'LAUF', 'SWG')
            GROUP BY ZaN_ZamSeria, MONTH(DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01'))
            ORDER BY MONTH(DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01')), ZaN_ZamSeria
        `;
    } else if (type === 'weekly') {
        // Tygodniowe zapytanie
        query = `
            SELECT
                ZaN_ZamSeria AS Seria,
                DATEPART(ISO_WEEK, DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01')) AS Tydzien,
                SUM(ZaE_Ilosc*ZaE_CenaUzgodniona) AS Kwota
            FROM
                cdn.ZamElem AS elem
                LEFT JOIN cdn.ZamNag AS nag
                ON elem.ZaE_GIDNumer = nag.ZaN_GIDNumer
            WHERE
                YEAR(DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01')) = ${year}
                AND ZaN_ZamSeria IN ('BEST', 'LAUF', 'SWG')
            GROUP BY
                ZaN_ZamSeria,
                DATEPART(ISO_WEEK, DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01'))
            ORDER BY
                Tydzien, Seria
        `;
    } else if (type === 'yearly') {
        // Roczne zapytanie
        query = `
            SELECT ZaN_ZamSeria AS Seria, YEAR(DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01')) AS Rok, SUM(ZaE_Ilosc*ZaE_CenaUzgodniona) AS Kwota
            FROM cdn.ZamElem AS elem
            LEFT JOIN cdn.ZamNag AS nag ON elem.ZaE_GIDNumer = nag.ZaN_GIDNumer
            WHERE ZaN_ZamSeria IN ('BEST', 'LAUF', 'SWG')
            GROUP BY ZaN_ZamSeria, YEAR(DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01'))
            ORDER BY Rok DESC
        `;
    } else {
        res.status(400).send('Invalid type. It should be either "monthly", "weekly" or "yearly".');
        return;
    }
    try {
        const result = await pool.query(query)
        res.json(result.recordset)
    } catch (err) {
        console.error(err)
        res.status(500).send(err.message)
    }
});
// Obsługa zapytań GET do serwera, ścieżka '/products'
server.get('/products', async (req, res) => {
    const query = `
        SELECT Kod_Towaru FROM
        (
            SELECT DISTINCT
            elem.ZaE_Twrkod As Kod_Towaru
            FROM cdn.ZamElem AS elem
            UNION
            SELECT DISTINCT
            elem.TrE_Twrkod As Kod_Towaru
            FROM cdn.TraElem AS elem
        ) AS subquery
        ORDER BY Kod_Towaru
    `;

    try {
        const result = await pool.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// soczewki - zamówienia
server.get('/product-orders/:code', async (req, res) => {
    const code = req.params.code;
    const query = `
        SELECT
        DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01') As Data,
        elem.ZaE_Ilosc As Ilość,
        elem.ZaE_cenaUzgodniona As Cena,
        elem.ZaE_Ilosc*elem.ZaE_CenaUzgodniona AS Wartość,
        CASE
            WHEN ((nag.ZaN_Stan IN (19, 21, 35, 51, 53)) OR ((elem.ZaE_Ilosc - traelem.TrE_Ilosc) <= 0))
            THEN 'PRAWDA'
            ELSE 'FAŁSZ'
        END AS zakończone,
        nag.ZaN_DokumentObcy AS Bestellung
        FROM cdn.ZamElem AS elem
        LEFT JOIN cdn.ZamNag AS nag ON elem.ZaE_GIDNumer = nag.ZaN_GIDNumer
        LEFT JOIN cdn.TraElem As traelem ON elem.ZaE_TwrKod = traelem.TrE_TwrNazwa AND nag.ZaN_DokumentObcy = traelem.TrE_TwrNazwa
        WHERE elem.ZaE_Twrkod = '${code}'
        ORDER BY data DESC
    `;

    try {
        const result = await pool.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// Obsługa zapytań GET do serwera, ścieżka '/product-description/:code'
server.get('/product-description/:code', async (req, res) => {
    const code = req.params.code;
    const query = `
        SELECT DISTINCT TOP 1
        karty.Twr_Nazwa As nazwa_towaru
        FROM cdn.ZamElem AS elem
        LEFT JOIN cdn.TwrKarty As karty ON elem.ZaE_TwrKod = karty.Twr_Kod
        WHERE elem.ZaE_Twrkod = '${code}'
    `;

    try {
        const result = await pool.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// soczewki - sprzedaż
server.get('/product-sales/:code', async (req, res) => {
    const code = req.params.code;
    const query = `
SELECT
        DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien) As Data,
        elem.TrE_Ilosc As Ilość,
        elem.TrE_WartoscPoRabacie / elem.TrE_Ilosc As Cena,
        elem.TrE_WartoscPoRabacie AS Wartość,
        elem.TrE_TwrNazwa AS Bestellung
        FROM cdn.TraElem AS elem
        LEFT JOIN cdn.TraNag AS nag ON elem.TrE_GIDNumer = nag.TrN_GIDNumer
        WHERE
            elem.TrE_Twrkod = '${code}'
          AND
            elem.TrE_KntTyp = 32
        ORDER BY data DESC
    `;

    try {
        const result = await pool.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// soczewki - sod - opis
server.get('/sod-opis/:code', async (req, res) => {
    const code = req.params.code;
    const query = `
        SELECT OPIS AS Opis
        FROM SPRAWA
        WHERE OPIS is not null
        AND NAZWA LIKE '%${code}%'
    `;

    try {
        const result = await poolSOD.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// odczyt obrazu z bazy danych SOD
server.get('/file/:id', async (req, res) => {
    const id = req.params.id;
    const query = `SELECT TRESC AS Tresc, PLIK AS Plik
        FROM DOKTRESC
        WHERE NUMER = '${id}'`;
    try {
        const result = await poolSODImages.query(query);
        if (result.recordset.length > 0) {
            const compressedData = result.recordset[0].Tresc;
            const fileName = result.recordset[0].Plik;
            const extension = path.extname(fileName).toLowerCase();
            let contentType = '';
            switch (extension) {
                case '.jpg':
                case '.jpeg':
                    contentType = 'image/jpeg';
                    break;
                case '.pdf':
                    contentType = 'application/pdf';
                    break;
                case '.docx':
                    contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                    break;
                case '.png':
                    contentType = 'image/png';
                    break;
                default:
                    res.status(400).send('Unsupported file format');
                    return;
            }
            zlib.gunzip(compressedData, (err, decompressedData) => {
                if (err) {
                    console.error(err);
                    res.status(500).send(err.message);
                } else {
                    res.set('Content-Type', contentType);
                    res.send(decompressedData);
                }
            });
        } else {
            res.status(404).send('Not found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
server.get('/available-files/:lens', async (req, res) => {
    const lens = req.params.lens;
    try {
        const request = new sql.Request(poolSOD);

        // Query to fetch documents for the selected lens from 'pool' database
        const docResult = await request
            .input('lens', sql.NVarChar, lens)
            .query(`
                SELECT DISTINCT D.DOKUMENT
                FROM SPRAWA S
                LEFT JOIN DOKUMENT D on S.NUMER = D.SPRAWA
                WHERE S.NAZWA LIKE '%' + @lens + '%' AND D.DOKUMENT is not null
            `);
        const documents = docResult.recordset;

        let availableFiles = [];
        for (let document of documents) {
            const documentString = document.DOKUMENT.toString();
            const requestSOD = new sql.Request(poolSODImages);
            const fileResult = await requestSOD
                .input('document', sql.NVarChar, documentString)
                .query(`
            SELECT PLIK, NUMER, PLIKDATA
            FROM DOKTRESC
            WHERE DOKUMENT = @document
        `);
            availableFiles.push(...fileResult.recordset);
        }

        res.json(availableFiles);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// Uruchomienie serwera
server.listen(port, () => console.log(`Server listening at http://localhost:${port}`))

// Tworzenie drugiego serwera dla statycznych plików
const staticServer = express();

// Ustawienie katalogu dla statycznych plików
staticServer.use(express.static(path.resolve(__dirname)));

// Uruchamianie drugiego serwera na innym porcie (4000)
staticServer.listen(4000, () => console.log('Static server listening at http://localhost:4000'));

// Tworzenie okna aplikacji Electron
function createWindow () {
    // Ustawienie parametrów okna
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
        }
    })

    win.setMenuBarVisibility(false); // Ukrywanie paska menu

    // Ładowanie strony startowej
    win.loadURL('http://localhost:4000/index.html');
}

// Tworzenie okna, gdy aplikacja jest gotowa
app.whenReady().then(createWindow)

// Zamykanie aplikacji, gdy wszystkie okna są zamknięte
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// Odtwarzanie okna, gdy aplikacja jest reaktywowana
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})
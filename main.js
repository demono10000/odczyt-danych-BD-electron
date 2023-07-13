// main.js
/**
 * Autor: Paweł Sołtys
 * Data: 2023-07-13
 */

// Importowanie modułów node.js
const { app, BrowserWindow } = require('electron')
const express = require('express')
const sql = require('mssql')
const path = require('path');
const cors = require('cors')

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

// Nawiązanie połączenia z bazą danych
sql.connect(config).catch(err => console.error('initial connection error', err))
server.use(cors()) // Użycie modułu CORS dla poprawnej komunikacji między serwerem a klientem

// Obsługa zapytań GET do serwera, ścieżka '/data/:year/:type'
server.get('/data/:year/:type', async (req, res) => {
    const year = req.params.year;
    const type = req.params.type;
    let query = '';
    if (type === 'monthly') {
        query = `
            SELECT nag.TrN_TrNSeria AS Seria, nag.TrN_VatMiesiac AS Miesiac, SUM(elem.TrE_WartoscPoRabacie) AS Kwota
            FROM CDN.TraElem AS elem
            LEFT JOIN CDN.TraNag AS nag
            ON elem.TrE_GIDNumer = nag.TrN_GIDNumer
            WHERE nag.TrN_VatRok = ${year} AND nag.TrN_TrNSeria IN ('BEST', 'LAUF', 'SWG')
            GROUP BY nag.TrN_TrNSeria, nag.TrN_VatMiesiac
        `;
    } else if (type === 'weekly') {
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
    } else {
        res.status(400).send('Invalid type. It should be either "monthly" or "weekly".');
        return;
    }
    try {
        const result = await sql.query(query)
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
        query = `
            SELECT ZaN_ZamSeria AS Seria,
                   MONTH(DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01')) AS Miesiac,
                   SUM(ZaE_Ilosc*ZaE_CenaUzgodniona) AS Kwota
            FROM cdn.ZamElem AS elem
            LEFT JOIN cdn.ZamNag AS nag ON elem.ZaE_GIDNumer = nag.ZaN_GIDNumer
            WHERE YEAR(DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01')) = ${year}
            GROUP BY ZaN_ZamSeria, MONTH(DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01'))
            ORDER BY MONTH(DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01')), ZaN_ZamSeria
        `;
    } else if (type === 'weekly') {
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
            GROUP BY
                ZaN_ZamSeria,
                DATEPART(ISO_WEEK, DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01'))
            ORDER BY
                Tydzien, Seria
        `;
    } else {
        res.status(400).send('Invalid type. It should be either "monthly" or "weekly".');
        return;
    }
    try {
        const result = await sql.query(query)
        res.json(result.recordset)
    } catch (err) {
        console.error(err)
        res.status(500).send(err.message)
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
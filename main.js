// main.js
/**
 * Autor: Paweł Sołtys
 * Data: 2023-08-21
 */

// Importowanie modułów node.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const express = require('express')
const sql = require('mssql')
const path = require('path');
const cors = require('cors');
const zlib = require('zlib');

// Stworzenie serwera Express.js na porcie 3000
const server = express();
const port = 3000;

const secret = require('./secret.js'); // Importowanie poufnych danych, takich jak nazwa użytkownika i hasło do bazy danych
const glasses = require('./data_files/glasses_grouped.json');
const {writeFile} = require("fs"); // Importowanie danych dotyczących szkieł

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

// Sprzedaż
server.get('/data/:year/:type', async (req, res) => {
    const year = req.params.year;
    const type = req.params.type;
    let query = '';
    if (type === 'monthly') {
        // Miesięczne zapytanie
        query = `
            SELECT nag.TrN_TrNSeria AS Seria, nag.TrN_VatMiesiac AS Miesiąc, SUM(elem.TrE_WartoscPoRabacie) AS Kwota
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
                DATEPART(ISO_WEEK, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)) AS Tydzień,
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
                Tydzień
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
// Sprzedaż - kalendarz miesięcznie
server.get('/sales-months-calendar/:monthStart/:yearStart/:monthEnd/:yearEnd', async (req, res) => {
    const monthStart = req.params.monthStart;
    const yearStart = req.params.yearStart;
    const monthEnd = req.params.monthEnd;
    const yearEnd = req.params.yearEnd;

    const request = new sql.Request(pool);
    request.input('monthStart', sql.Int, monthStart);
    request.input('yearStart', sql.Int, yearStart);
    request.input('monthEnd', sql.Int, monthEnd);
    request.input('yearEnd', sql.Int, yearEnd);

    const query = `
    SELECT
        nag.TrN_TrNSeria AS Seria,
        CONCAT(nag.TrN_VatMiesiac, '-', nag.TrN_VatRok) AS Miesiąc_Rok,
        SUM(elem.TrE_WartoscPoRabacie) AS Kwota
    FROM
        CDN.TraElem AS elem
        LEFT JOIN CDN.TraNag AS nag
        ON elem.TrE_GIDNumer = nag.TrN_GIDNumer
    WHERE
        (
            (nag.TrN_VatRok = ${yearStart} AND nag.TrN_VatMiesiac >= ${monthStart} AND (nag.TrN_VatRok < ${yearEnd} OR (nag.TrN_VatRok = ${yearEnd} AND nag.TrN_VatMiesiac <= ${monthEnd})))
            OR
            (nag.TrN_VatRok > ${yearStart} AND nag.TrN_VatRok < ${yearEnd})
            OR
            (nag.TrN_VatRok = ${yearEnd} AND nag.TrN_VatMiesiac <= ${monthEnd} AND nag.TrN_VatRok > ${yearStart})
        )
        AND nag.TrN_TrNSeria IN ('BEST', 'LAUF', 'SWG')
    GROUP BY
        nag.TrN_TrNSeria,
        nag.TrN_VatMiesiac,
        nag.TrN_VatRok
    ORDER BY
        nag.TrN_VatRok,
        nag.TrN_VatMiesiac,
        nag.TrN_TrNSeria
    `;
    try {
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
})
// Sprzedaż - kalendarz tygodniowo
server.get('/sales-weeks-calendar/:weekStart/:yearStart/:weekEnd/:yearEnd', async (req, res) => {
    const weekStart = req.params.weekStart;
    const yearStart = req.params.yearStart;
    const weekEnd = req.params.weekEnd;
    const yearEnd = req.params.yearEnd;

    const request = new sql.Request(pool);
    request.input('weekStart', sql.Int, weekStart);
    request.input('yearStart', sql.Int, yearStart);
    request.input('weekEnd', sql.Int, weekEnd);
    request.input('yearEnd', sql.Int, yearEnd);

    const query = `
    SELECT
    nag.TrN_TrNSeria AS Seria,
    CONCAT(DATEPART(ISO_WEEK, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)), '-', nag.TrN_VatRok) AS Tydzień_Rok,
    SUM(elem.TrE_WartoscPoRabacie) AS Kwota
    FROM
        CDN.TraElem AS elem
        LEFT JOIN CDN.TraNag AS nag
        ON elem.TrE_GIDNumer = nag.TrN_GIDNumer
    WHERE
        (
            (DATEPART(YEAR, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)) = ${yearStart} AND DATEPART(ISO_WEEK, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)) >= ${weekStart} AND (DATEPART(YEAR, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)) < ${yearEnd} OR (DATEPART(YEAR, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)) = ${yearEnd} AND DATEPART(ISO_WEEK, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)) <= ${weekEnd})))
            OR
            (DATEPART(YEAR, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)) > ${yearStart} AND DATEPART(YEAR, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)) < ${yearEnd})
            OR
            (DATEPART(YEAR, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)) = ${yearEnd} AND DATEPART(ISO_WEEK, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)) <= ${weekEnd} AND DATEPART(YEAR, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)) > ${yearStart})
        )
        AND nag.TrN_TrNSeria IN ('BEST', 'LAUF', 'SWG')
    GROUP BY
        nag.TrN_TrNSeria,
        DATEPART(ISO_WEEK, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)),
        nag.TrN_VatRok
    ORDER BY
        nag.TrN_VatRok,
        DATEPART(ISO_WEEK, DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien)),
        nag.TrN_TrNSeria
    `;
    try {
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
})
// Zamówienia
server.get('/orders/:year/:type', async (req, res) => {
    const year = req.params.year;
    const type = req.params.type;
    let query = '';
    if (type === 'monthly') {
        // Miesięczne zapytanie
        query = `
            SELECT ZaN_ZamSeria AS Seria,
                   MONTH(DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01')) AS Miesiąc,
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
                DATEPART(ISO_WEEK, DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01')) AS Tydzień,
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
                Tydzień, Seria
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
// Zamówienia - kalendarz miesięcznie
server.get('/orders-months-calendar/:monthStart/:yearStart/:monthEnd/:yearEnd', async (req, res) => {
    const monthStart = req.params.monthStart;
    const yearStart = req.params.yearStart;
    const monthEnd = req.params.monthEnd;
    const yearEnd = req.params.yearEnd;

    const request = new sql.Request(pool);
    request.input('monthStart', sql.Int, monthStart);
    request.input('yearStart', sql.Int, yearStart);
    request.input('monthEnd', sql.Int, monthEnd);
    request.input('yearEnd', sql.Int, yearEnd);

    const query = `
    SELECT
        ZaN_ZamSeria AS Seria,
        CONCAT(MONTH(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')), '-', YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01'))) AS Miesiąc_Rok,
        SUM(ZaE_Ilosc * ZaE_CenaUzgodniona) AS Kwota
    FROM
        cdn.ZamElem AS elem
        LEFT JOIN cdn.ZamNag AS nag
        ON elem.ZaE_GIDNumer = nag.ZaN_GIDNumer
    WHERE
        (
            (YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) = ${yearStart} AND MONTH(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) >= ${monthStart} AND (YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) < ${yearEnd} OR (YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) = ${yearEnd} AND MONTH(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) <= ${monthEnd})))
            OR
            (YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) > ${yearStart} AND YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) < ${yearEnd})
            OR
            (YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) = ${yearEnd} AND MONTH(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) <= ${monthEnd} AND YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) > ${yearStart})
        )
        AND ZaN_ZamSeria IN ('BEST', 'LAUF', 'SWG')
    GROUP BY
        ZaN_ZamSeria,
        MONTH(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')),
        YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01'))
    ORDER BY
        YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')),
        MONTH(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')),
        ZaN_ZamSeria
    `;
    try {
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
})
// Zamówienia - kalendarz tygodniowo
server.get('/orders-weeks-calendar/:weekStart/:yearStart/:weekEnd/:yearEnd', async (req, res) => {
    const weekStart = req.params.weekStart;
    const yearStart = req.params.yearStart;
    const weekEnd = req.params.weekEnd;
    const yearEnd = req.params.yearEnd;

    const request = new sql.Request(pool);
    request.input('weekStart', sql.Int, weekStart);
    request.input('yearStart', sql.Int, yearStart);
    request.input('weekEnd', sql.Int, weekEnd);
    request.input('yearEnd', sql.Int, yearEnd);

    const query = `
    SELECT
        ZaN_ZamSeria AS Seria,
        CONCAT(DATEPART(ISO_WEEK, DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')), '-', YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01'))) AS Tydzień_Rok,
        SUM(ZaE_Ilosc * ZaE_CenaUzgodniona) AS Kwota
    FROM
        cdn.ZamElem AS elem
        LEFT JOIN cdn.ZamNag AS nag
        ON elem.ZaE_GIDNumer = nag.ZaN_GIDNumer
    WHERE
        (
            (YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) = ${yearStart} AND DATEPART(ISO_WEEK, DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) >= ${weekStart} AND (YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) < ${yearEnd} OR (YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) = ${yearEnd} AND DATEPART(ISO_WEEK, DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) <= ${weekEnd})))
            OR
            (YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) > ${yearStart} AND YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) < ${yearEnd})
            OR
            (YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) = ${yearEnd} AND DATEPART(ISO_WEEK, DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) <= ${weekEnd} AND YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')) > ${yearStart})
        )
        AND ZaN_ZamSeria IN ('BEST', 'LAUF', 'SWG')
    GROUP BY
        ZaN_ZamSeria,
        DATEPART(ISO_WEEK, DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')),
        YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01'))
    ORDER BY
        YEAR(DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')),
        DATEPART(ISO_WEEK, DATEADD(day, ZaN_DataWystawienia - 36163, '1900-01-01')),
        ZaN_ZamSeria
    `;
    try {
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
})
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
        nag.ZaN_DokumentObcy AS Bestellung,
        atr18.Atr_Wartosc AS Klient,
        'ZS/' + nag.ZaN_ZamSeria + '/' + CAST(nag.ZaN_ZamNumer AS NVARCHAR) + '/' + CAST(nag.ZaN_ZamRok AS NVARCHAR) AS NrZamówienia,
        atr27.Atr_Wartosc AS cnc_frez,
        atr28.Atr_Wartosc AS cnc_poler,
        atr29.Atr_Wartosc AS cnc_centr,
        atr44.Atr_Wartosc AS powłoka
    FROM cdn.ZamElem AS elem
    LEFT JOIN cdn.ZamNag AS nag ON elem.ZaE_GIDNumer = nag.ZaN_GIDNumer
    LEFT JOIN cdn.TraElem As traelem ON elem.ZaE_TwrKod = traelem.TrE_TwrNazwa AND nag.ZaN_DokumentObcy = traelem.TrE_TwrNazwa
    LEFT JOIN cdn.atrybuty AS atr18 ON nag.ZaN_GIDNumer = atr18.Atr_ObiNumer AND atr18.Atr_AtkId = 18
    LEFT JOIN cdn.atrybuty AS atr27 ON nag.ZaN_GIDNumer = atr27.Atr_ObiNumer AND atr27.Atr_AtkId = 27
    LEFT JOIN cdn.atrybuty AS atr28 ON nag.ZaN_GIDNumer = atr28.Atr_ObiNumer AND atr28.Atr_AtkId = 28
    LEFT JOIN cdn.atrybuty AS atr29 ON nag.ZaN_GIDNumer = atr29.Atr_ObiNumer AND atr29.Atr_AtkId = 29
    LEFT JOIN cdn.atrybuty AS atr44 ON nag.ZaN_GIDNumer = atr44.Atr_ObiNumer AND atr44.Atr_AtkId = 44
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
    SELECT DISTINCT
        DATEFROMPARTS(nag.TrN_VatRok, nag.TrN_VatMiesiac, nag.TrN_VatDzien) As Data,
        TrN_GIDNumer,
        elem.TrE_Ilosc As Ilość,
        CASE
            WHEN COALESCE(elem.TrE_Ilosc, 0) = 0 THEN 0
            ELSE elem.TrE_WartoscPoRabacie / elem.TrE_Ilosc
        END AS Cena,
        elem.TrE_WartoscPoRabacie AS Wartość,
        elem.TrE_TwrNazwa AS Bestellung,
        atr.Atr_Wartosc AS Klient,
        CASE
            WHEN nag.TrN_TrNTyp = 20 THEN 'FSE-'
            ELSE 'FS-'
        END + nag.TrN_TrNSeria + '/' + CAST(nag.TrN_TrNNumer AS NVARCHAR) + '/' + CAST(nag.TrN_TrNRok AS NVARCHAR) AS NrFaktury
    FROM
        cdn.TraElem elem
        LEFT JOIN cdn.traNag nag ON nag.TrN_GIDTyp=elem.TrE_GIDTyp AND nag.TrN_GIDNumer=elem.TrE_GIDNumer
        LEFT JOIN cdn.atrybuty atr ON elem.TrE_GIDNumer=atr.Atr_ObiNumer AND atr.Atr_AtkId = 18
    
    WHERE
        elem.TrE_Twrkod = '${code}'
        AND
        elem.TrE_KntTyp = 32
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
                case '.xlsx':
                case '.xls':
                    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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

        // Sort files from newest to oldest
        availableFiles.sort((a, b) => new Date(b.PLIKDATA) - new Date(a.PLIKDATA));

        res.json(availableFiles);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// Obsługa zapytań GET do serwera, ścieżka '/customers'
server.get('/customers', async (req, res) => {
    const query = `
        SELECT DISTINCT a.Atr_Wartosc
        FROM cdn.Atrybuty a
        WHERE a.Atr_AtkId = 18
        ORDER BY a.Atr_Wartosc
    `;

    try {
        const result = await pool.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// transakcje klienta
server.get('/customer-transactions/:client', async (req, res) => {
    const client = req.params.client;
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;

    const request = new sql.Request(pool);
    request.input('client', sql.NVarChar, client);

    let finalQuery = `
WITH ranked_rows AS (
  SELECT
    a.ZaE_TwrKod AS Kod_Towaru,
    TrE_Ilosc AS Wyslane,
    ZaE_Ilosc AS Zamowione,
    ZaN_DokumentObcy AS Bestellung,
    DENSE_RANK() OVER(PARTITION BY ZaN_DokumentObcy, DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01') ORDER BY TrE_Ilosc DESC) AS rn,
    DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01') As Data
  FROM
    cdn.zamelem a
    INNER JOIN cdn.zamnag b ON b.ZaN_GIDNumer=a.ZaE_GIDNumer
    LEFT JOIN cdn.TraElem c ON c.TrE_TwrKod=a.ZaE_TwrKod AND b.Zan_DokumentObcy = c.TrE_TwrNazwa
    LEFT JOIN cdn.traNag d ON d.TrN_GIDTyp=c.TrE_GIDTyp AND d.TrN_GIDNumer=c.TrE_GIDNumer
    LEFT JOIN cdn.KntAdresy e ON e.KnA_GIDNumer= a.ZaE_KntNumer
    LEFT JOIN cdn.atrybuty f ON b.ZaN_GIDNumer=f.Atr_ObiNumer
  WHERE f.Atr_AtkId = 18 AND f.Atr_Wartosc = @client AND c.TrE_KntTyp = 32
)
SELECT
            Kod_Towaru,
            SUM(Wyslane) AS Wysłane,
            SUM(
            CASE
                WHEN rn = 1 THEN Zamowione
                ELSE 0
            END) AS Zamówione
        FROM ranked_rows
    `;
    if(startDate && endDate) {
        finalQuery += ` WHERE Data BETWEEN @startDate AND @endDate`;
        request.input('startDate', sql.Date, new Date(startDate));
        request.input('endDate', sql.Date, new Date(endDate));
    }

    finalQuery += ` GROUP BY Kod_Towaru`;

    try {
        const result = await request.query(finalQuery);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// soczewki - sod - ze szklad
server.get('/sod-lens-from-glass/:code', async (req, res) => {
    const code = req.params.code;
    const query = `
        SELECT
        CASE
            WHEN CHARINDEX(CHAR(10), CAST(OPIS AS varchar(max))) > 0
            THEN LEFT(CAST(OPIS AS varchar(max)), CHARINDEX(CHAR(10), CAST(OPIS AS varchar(max))) - 1)
            ELSE CAST(OPIS AS varchar(max))
        END AS Soczewka
    FROM SPRAWA
    WHERE OPIS LIKE '%${code}%'
    `;

    try {
        const result = await poolSOD.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// Odczyt listy szkieł
server.get('/glasses', async (req, res) => {
    return res.json(glasses);
});
// Odczyt najczęstszych zamówień
server.get('/lenses-most-ordered', async (req, res) => {
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const glassName = req.query.glassName || null;
    const minOrders = req.query.minOrders || null;

    const request = new sql.Request(pool);
    let lensCodesFilter = '';
    let dateFilter = '';
    let minOrderFilter = '';

    if (startDate && endDate) {
        dateFilter = `AND DATEADD(day, b.ZaN_DataWystawienia-36163, '1900-01-01') BETWEEN @startDate AND @endDate`;
        request.input('startDate', sql.Date, new Date(startDate));
        request.input('endDate', sql.Date, new Date(endDate));
    }

    if (minOrders) {
        minOrderFilter = `HAVING COUNT(*) >= @minOrders`;
        request.input('minOrders', sql.Int, parseInt(minOrders));
    }

    if (glassName) {
        const glassQuery = `
            SELECT 
            CASE
                WHEN CHARINDEX(CHAR(10), CAST(OPIS AS varchar(max))) > 0
                THEN LEFT(CAST(OPIS AS varchar(max)), CHARINDEX(CHAR(10), CAST(OPIS AS varchar(max))) - 1)
                ELSE CAST(OPIS AS varchar(max))
            END AS Soczewka
            FROM SPRAWA
            WHERE OPIS LIKE '%${glassName}%'
        `;

        const lensesFromGlass = await poolSOD.query(glassQuery);
        if (lensesFromGlass.recordset.length === 0) {
            return res.json([]); // No results for the given glass
        }

        const lensCodes = lensesFromGlass.recordset
            .map(lens => `'${lens.Soczewka.trim()}'`)
            .join(',');
        lensCodesFilter = `AND a.ZaE_TwrKod IN (${lensCodes})`;
    }

    let baseQuery = `
        WITH lens_orders AS (
            SELECT DISTINCT
                a.ZaE_TwrKod AS Kod_Towaru,
                ZaN_DokumentObcy,
                b.ZaN_ZamNumer
            FROM cdn.zamelem a
            INNER JOIN cdn.zamnag b ON b.ZaN_GIDNumer = a.ZaE_GIDNumer
            LEFT JOIN cdn.TraElem c ON c.TrE_TwrKod = a.ZaE_TwrKod AND b.Zan_DokumentObcy = c.TrE_TwrNazwa
            WHERE 1=1 ${lensCodesFilter} ${dateFilter}
        )
        SELECT Kod_Towaru, COUNT(*) AS Zamówienia
        FROM lens_orders
        GROUP BY Kod_Towaru
        ${minOrderFilter}
        ORDER BY Zamówienia DESC
    `;

    try {
        const result = await request.query(baseQuery);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// towary robione przez cnc
server.get('/cnc-lenses', async (req, res) => {
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;

    const request = new sql.Request(pool);

    let finalQuery = `
    SELECT DISTINCT
        elem.ZaE_Twrkod AS Kod_Towaru
    FROM cdn.ZamElem AS elem
    LEFT JOIN cdn.ZamNag AS nag ON elem.ZaE_GIDNumer = nag.ZaN_GIDNumer
    LEFT JOIN cdn.atrybuty AS atr27 ON nag.ZaN_GIDNumer = atr27.Atr_ObiNumer AND atr27.Atr_AtkId = 27
    WHERE atr27.Atr_Wartosc = 'TAK'
    `;
    if(startDate && endDate) {
        finalQuery += ` AND DATEADD(day, ZaN_DataWystawienia-36163, '1900-01-01') BETWEEN @startDate AND @endDate`;
        request.input('startDate', sql.Date, new Date(startDate));
        request.input('endDate', sql.Date, new Date(endDate));
    }

    try {
        const result = await request.query(finalQuery);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// kontrahenci
server.get('/contractors', async (req, res) => {
    const request = new sql.Request(poolSOD);

    let finalQuery = `
    SELECT DISTINCT
        K.NUMER AS Numer,
        CASE
            WHEN K.IDENTYFIKATOR = K.NAZWA THEN K.NAZWA
            ELSE CONCAT(K.NAZWA, ' (', K.IDENTYFIKATOR, ')')
        END AS Nazwa
    FROM KONTRAHENT AS K
    INNER JOIN DOKUMENT AS D ON K.NUMER = D.KONTRAHENT
    `;

    try {
        const result = await request.query(finalQuery);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// kontrahent szczegóły
server.get('/contractor/:id', async (req, res) => {
    const id = req.params.id;
    const request = new sql.Request(poolSOD);

    let finalQuery = `
    SELECT DISTINCT
    K.TYP, K.NIP, K.ADRES_KOD, K.ADRES_POCZTA, K.ADRES_MIEJSCOWOSC, K.ADRES_ULICA, K.ADRES_NR_DOMU, K.TELEFON
    FROM KONTRAHENT AS K
    WHERE K.NUMER = @id
    `;
    request.input('id', sql.Int, parseInt(id));
    try {
        const result = await request.query(finalQuery);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// pliki kontrahenta
server.get('/files-contractor/:contractor', async (req, res) => {
    const contractor = req.params.contractor;
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    try {
        const request = new sql.Request(poolSOD);

        let baseQuery = `
        SELECT
                D.DOKUMENT, D.NAZWA, D.OPIS
                FROM DOKUMENT as D
                LEFT JOIN KONTRAHENT AS K ON D.KONTRAHENT = K.NUMER 
                WHERE K.NUMER = @contractor
        `;
        if (startDate && endDate) {
            baseQuery += `AND DATANADOK BETWEEN @startDate AND @endDate`;
            request.input('startDate', sql.Date, new Date(startDate));
            request.input('endDate', sql.Date, new Date(endDate));
        }

        const docResult = await request
            .input('contractor', sql.NVarChar, contractor)
            .query(baseQuery);
        const documents = docResult.recordset;

        let availableFiles = [];
        for (let document of documents) {
            const documentString = document.DOKUMENT.toString();
            const clientName = document.NAZWA;
            const description = document.OPIS;
            const requestSOD = new sql.Request(poolSODImages);
            const fileResult = await requestSOD
                .input('document', sql.NVarChar, documentString)
                .input('clientName', sql.NVarChar, clientName)
                .input('opis', sql.NVarChar, description)
                .query(`
            SELECT PLIK, NUMER, PLIKDATA, @clientName AS NAZWA, @opis AS OPIS, @document AS DOKUMENT
            FROM DOKTRESC
            WHERE DOKUMENT = @document
        `);
            availableFiles.push(...fileResult.recordset);
        }

        availableFiles.sort((a, b) => new Date(b.PLIKDATA) - new Date(a.PLIKDATA));

        res.json(availableFiles);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// odczyt szczegółów dokumentu z SOD
server.get('/fileDetails/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const request = new sql.Request(poolSOD);

        let finalQuery = `
        SELECT
        *
        FROM DOKUMENT as D
        WHERE D.NUMER = @id
        `;
        const result = await request
            .input('id', sql.Int, parseInt(id))
            .query(finalQuery);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// kontrahenci z filtrami
server.get('/contractors-filtered', async (req, res) => {
    const description = req.query.description || null;
    const nip = req.query.nip || null;
    const city = req.query.city || null;
    const code = req.query.code || null;

    const request = new sql.Request(poolSOD);

    let finalQuery = `
    SELECT DISTINCT
        K.NUMER, K.NIP, K.NAZWA, K.ADRES_KOD, K.ADRES_KOR_KOD, K.ADRES_MIEJSCOWOSC, K.ADRES_KOR_MIEJSCOWOSC
    FROM KONTRAHENT AS K
    LEFT JOIN DOKUMENT AS D ON K.NUMER = D.KONTRAHENT
    WHERE 1 = 1
    `;
    if (description) {
        finalQuery += ` AND D.OPIS LIKE @description`;
        request.input('description', sql.NVarChar, '%' + description + '%');
    }
    if (nip) {
        finalQuery += ` AND REPLACE(REPLACE(K.NIP, '-', ''), ' ', '') LIKE @nip`;
        request.input('nip', sql.NVarChar, nip + '%');
    }
    if (city) {
        finalQuery += ` AND (K.ADRES_MIEJSCOWOSC LIKE @city OR K.ADRES_KOR_MIEJSCOWOSC LIKE @city)`;
        request.input('city', sql.NVarChar, '%' + city + '%');
    }
    if (code) {
        finalQuery += ` AND (K.ADRES_KOD LIKE @code OR K.ADRES_KOR_KOD LIKE @code)`;
        request.input('code', sql.NVarChar, code + '%');
    }
    try {
        const result = await request.query(finalQuery);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});
// typy dokumentów
server.get('/documentTypes', async (req, res) => {
    const request = new sql.Request(poolSOD);

    let finalQuery = `
    SELECT DISTINCT
        D.NAZWA
        FROM DOKUMENT as D
    ORDER BY D.NAZWA ASC
    `;
    try {
        const result = await request.query(finalQuery);
        res.json(result.recordset);
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
            contextIsolation: false
        },
        icon: __dirname + '/ikony/win/favicon.ico'
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

ipcMain.on('save-excel-dialog', (event, excelData) => {
    console.log('Zapisywanie pliku Excel');
    dialog.showSaveDialog(
        {
            title: 'Zapisz jako plik Excel',
            defaultPath: 'nazwa-pliku.xlsx',
            filters: [{name: 'Pliki Excel', extensions: ['xlsx']}],
        }
    ).then(r => {
        if(!r.canceled){
            writeFile(r.filePath, excelData, (err) => {
                if (err) {
                    console.error('Błąd podczas zapisywania pliku:', err);
                } else {
                    console.log('Plik Excel został zapisany:', r.filePath);
                }
            });
        }
    });
});
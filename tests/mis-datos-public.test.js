'use strict';

const path = require('path');
const request = require('supertest');
const express = require('express');
const session = require('express-session');
const { i18nMiddleware } = require('../middleware/i18n');
const company = require('../config/company');

function createApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: 'fandez-test-secret', resave: false, saveUninitialized: true }));
  app.use(i18nMiddleware);
  app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.company = company;
    res.locals.asset = (url) => url;
    res.locals.mod = () => false;
    res.locals.siteUrl = 'https://www.fandez.cl';
    next();
  });
  app.use('/legal', require('../routes/legal'));
  return app;
}

describe('GET /legal/mis-datos público', () => {
  test('explica cómo eliminar la cuenta sin exigir login', async () => {
    const res = await request(createApp()).get('/legal/mis-datos');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Eliminar cuenta y datos/);
    expect(res.text).toMatch(/Eliminar mi cuenta y mis datos/);
    expect(res.text).toMatch(/\/login\?next=\/legal\/mis-datos/);
    expect(res.headers.location).toBeUndefined();
  });
});

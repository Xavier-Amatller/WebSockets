const fs = require('fs').promises;
const path = require('path');

const dbPath = path.join(__dirname, '../db.json');

async function readDB() {
  try {
    const data = await fs.readFile(dbPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error al leer db.json:', error);
    return { users: [], messages: [], documents: [] };
  }
}

async function writeDB(data) {
  try {
    await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error al escribir en db.json:', error);
  }
}

module.exports = { readDB, writeDB };
// utils/fileCleanup.js
const fs = require('fs').promises;
const path = require('path');

const deleteFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    console.log(`File deleted: ${filePath}`);
  } catch (error) {
    console.error('Error deleting file:', error);
  }
};

const deleteFiles = async (filePaths) => {
  try {
    await Promise.all(filePaths.map(filePath => fs.unlink(filePath)));
    console.log('Files deleted successfully');
  } catch (error) {
    console.error('Error deleting files:', error);
  }
};

module.exports = { deleteFile, deleteFiles };
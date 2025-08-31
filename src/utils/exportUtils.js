
import { 
  collection, 
  addDoc, 
  getDocs, 
  
  deleteDoc,
 
} from 'firebase/firestore';
import { db } from '../firebase';
import { COLUMN_TYPES } from '../config/columnTypes';

export const exportToCSV = async (collectionName, tableName) => {
  try {
    const tableCollectionRef = collection(db, collectionName);
    const querySnapshot = await getDocs(tableCollectionRef);
    
    if (querySnapshot.empty) {
      throw new Error('No table data found');
    }
    
    const rows = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get all unique column names from all rows (excluding metadata fields)
    const allColumns = new Set();
    rows.forEach(row => {
      Object.keys(row).forEach(key => {
        if (!['id', 'createdAt', 'updatedAt'].includes(key)) {
          allColumns.add(key);
        }
      });
    });
    
    const columns = Array.from(allColumns).map(key => ({ id: key, name: key }));
    
    if (columns.length === 0) {
      throw new Error('No data columns found');
    }
    
    const headers = columns.map(col => col.name).join(',');
    
    const csvRows = rows.map(row => {
      return columns.map(col => {
        const value = row[col.id] || '';
        // Handle values that contain commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });
    
    const csvContent = [headers, ...csvRows].join('\n');
    
    downloadFile(csvContent, `${tableName || 'table'}.csv`, 'text/csv');
    
    return csvContent;
  } catch (error) {
    console.error('Export to CSV failed:', error);
    throw error;
  }
};

export const exportToJSON = async (collectionName, tableName) => {
  try {
    const tableCollectionRef = collection(db, collectionName);
    const querySnapshot = await getDocs(tableCollectionRef);
    
    if (querySnapshot.empty) {
      throw new Error('No table data found');
    }
    
    const rows = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get all unique column names from all rows (excluding metadata fields)
    const allColumns = new Set();
    rows.forEach(row => {
      Object.keys(row).forEach(key => {
        if (!['id', 'createdAt', 'updatedAt'].includes(key)) {
          allColumns.add(key);
        }
      });
    });
    
    const columns = Array.from(allColumns).map(key => ({
      id: key,
      name: key,
      type: detectColumnTypeFromValue(rows[0][key])
    }));
    
    const exportData = {
      tableName: tableName || 'table',
      exportDate: new Date().toISOString(),
      columns: columns,
      rows: rows.map(row => {
        const cleanedRow = { ...row };
        // Remove metadata fields from exported data
        delete cleanedRow.id;
        delete cleanedRow.createdAt;
        delete cleanedRow.updatedAt;
        return cleanedRow;
      }),
      metadata: {
        totalRows: rows.length,
        totalColumns: columns.length
      }
    };
    
    const jsonContent = JSON.stringify(exportData, null, 2);
    downloadFile(jsonContent, `${tableName || 'table'}.json`, 'application/json');
    
    return exportData;
  } catch (error) {
    console.error('Export to JSON failed:', error);
    throw error;
  }
};

export const previewCSV = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const csvContent = e.target.result;
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
          throw new Error('CSV file is empty');
        }
        
        const headers = parseCSVLine(lines[0]);
        
        const previewRows = lines.slice(1, 11).map(line => parseCSVLine(line));
        
        const columns = headers.map((header, index) => ({
          id: `col_${Date.now()}_${index}`,
          name: header,
          type: detectColumnType(lines.slice(1).map(line => parseCSVLine(line)), index),
          editable: true
        }));
        
        resolve({
          headers,
          previewRows,
          columns,
          totalRows: lines.length - 1,
          fileName: file.name
        });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

export const previewJSON = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const jsonContent = JSON.parse(e.target.result);
        
        if (!jsonContent.columns || !jsonContent.rows) {
          throw new Error('Invalid JSON format. Expected columns and rows properties.');
        }
        
        const previewRows = jsonContent.rows.slice(0, 10);
        
        resolve({
          columns: jsonContent.columns,
          previewRows,
          totalRows: jsonContent.rows.length,
          fileName: file.name,
          fullData: jsonContent
        });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

export const importFromCSV = async (file, collectionName, shouldAppend = true) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const csvContent = e.target.result;
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
          throw new Error('CSV file is empty');
        }
        
        const headers = parseCSVLine(lines[0]);
        const dataRows = lines.slice(1).map(line => parseCSVLine(line));
        
        const tableCollectionRef = collection(db, collectionName);
        
        if (!shouldAppend) {
          // If not appending, delete all existing data first
          const existingDocs = await getDocs(tableCollectionRef);
          const deletePromises = existingDocs.docs.map(doc => deleteDoc(doc.ref));
          await Promise.all(deletePromises);
        }
        
        const rows = [];
        for (let i = 0; i < dataRows.length; i++) {
          const rowData = dataRows[i];
          const row = {
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          headers.forEach((header, colIndex) => {
            const columnType = detectColumnType(dataRows, colIndex);
            row[header] = convertValue(rowData[colIndex], columnType);
          });
          
          await addDoc(tableCollectionRef, row);
          rows.push(row);
        }
        
        resolve({ imported: rows.length, isAppend: shouldAppend });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

export const importFromJSON = async (file, collectionName, shouldAppend = true) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const jsonContent = JSON.parse(e.target.result);
        
        if (!jsonContent.columns || !jsonContent.rows) {
          throw new Error('Invalid JSON format. Expected columns and rows properties.');
        }
        
        const tableCollectionRef = collection(db, collectionName);
        
        if (!shouldAppend) {
          // If not appending, delete all existing data first
          const existingDocs = await getDocs(tableCollectionRef);
          const deletePromises = existingDocs.docs.map(doc => deleteDoc(doc.ref));
          await Promise.all(deletePromises);
        }
        
        const importedRows = [];
        for (let i = 0; i < jsonContent.rows.length; i++) {
          const row = {
            ...jsonContent.rows[i],
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          delete row.id;
          delete row.serialNo; // Remove serialNo if it exists
          
          await addDoc(tableCollectionRef, row);
          importedRows.push(row);
        }
        
        resolve({ imported: importedRows.length, isAppend: shouldAppend });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

export const importFromExcel = async (file, collectionName, shouldAppend = true) => {
  throw new Error('Excel import is not available. Please install the xlsx library or use CSV/JSON import instead.');
};

const downloadFile = (content, filename, type) => {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
};

const detectColumnType = (rows, colIndex) => {
  const sampleValues = rows.slice(0, 10).map(row => row[colIndex]).filter(val => val !== undefined && val !== '');
  
  if (sampleValues.length === 0) return 'text';
  
  if (sampleValues.every(val => !isNaN(val) && val !== '')) {
    return 'number';
  }
  
  if (sampleValues.every(val => val === 'true' || val === 'false' || val === true || val === false)) {
    return 'boolean';
  }
  
  if (sampleValues.every(val => !isNaN(Date.parse(val)))) {
    return 'date';
  }
  
  if (sampleValues.every(val => typeof val === 'string' && (val.startsWith('http') || val.startsWith('www')))) {
    return 'link';
  }
  
  if (sampleValues.every(val => typeof val === 'string' && val.includes('@'))) {
    return 'email';
  }
  
  return 'text';
};

const detectColumnTypeFromValue = (value) => {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') {
    if (!isNaN(Date.parse(value)) && value.includes('-')) return 'date';
    if (value.includes('@') && value.includes('.')) return 'email';
    if (value.startsWith('http') || value.startsWith('www')) return 'link';
  }
  return 'text';
};

const convertValue = (value, type) => {
  if (value === undefined || value === null || value === '') {
    return COLUMN_TYPES[type]?.defaultValue || '';
  }
  
  switch (type) {
    case 'number':
      return Number(value) || 0;
    case 'boolean':
      return value === 'true' || value === true;
    case 'date':
      const date = new Date(value);
      return isNaN(date.getTime()) ? new Date().toISOString().split('T')[0] : date.toISOString().split('T')[0];
    default:
      return String(value);
  }
};


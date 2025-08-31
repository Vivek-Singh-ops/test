import { useState, useCallback } from 'react';
import { doc, updateDoc, collection, addDoc, getDocs, deleteDoc, query, orderBy, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useErrorHandler } from './useErrorHandler';
import { COLUMN_TYPES } from '../config/columnTypes';

export function useTableData(tableId) {
  const [tableData, setTableData] = useState({
    columns: [
      { id: 'serialNo', name: 'Serial No.', type: 'number', editable: false }
    ],
    rows: []
  });
  const [collectionName, setCollectionName] = useState(null);
  const [tableName, setTableName] = useState(null);
  const { error, loading, executeAsync, clearError } = useErrorHandler();

  const loadTableData = useCallback(async () => {
    if (!tableId) return;
    
    await executeAsync(async () => {
      // First get the table metadata from userTables
      const tableDoc = await getDoc(doc(db, 'userTables', tableId));
      if (!tableDoc.exists()) {
        throw new Error('Table not found');
      }
      
      const tableInfo = tableDoc.data();
      setCollectionName(tableInfo.collectionName);
      setTableName(tableInfo.name);
      
      // Now get the actual table data from the dedicated collection
      const tableCollectionRef = collection(db, tableInfo.collectionName);
      const querySnapshot = await getDocs(tableCollectionRef);
      
      if (!querySnapshot.empty) {
        const rows = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        if (rows.length > 0) {
          const firstRow = rows[0];
          const dynamicColumns = Object.keys(firstRow)
            .filter(key => !['id', 'createdAt', 'updatedAt', 'serialNo'].includes(key))
            .map(key => ({
              id: key,
              name: key,
              type: detectColumnTypeFromValue(firstRow[key]),
              editable: true
            }));
          
          setTableData({
            columns: dynamicColumns,
            rows: rows
          });
        } else {
          setTableData({
            columns: [],
            rows: []
          });
        }
      } else {
        setTableData({
          columns: [],
          rows: []
        });
      }
    });
  }, [tableId, executeAsync]);

  const addRow = useCallback(async () => {
    if (!collectionName) return;
    
    await executeAsync(async () => {
      const tableCollectionRef = collection(db, collectionName);
      
      const newRow = {
        createdAt: new Date(),
        updatedAt: new Date()
      };

      tableData.columns.forEach(col => {
        newRow[col.id] = COLUMN_TYPES[col.type].defaultValue;
      });

      await addDoc(tableCollectionRef, newRow);
      
      // Update table metadata
      await updateDoc(doc(db, 'userTables', tableId), {
        rowCount: (tableData.rows.length || 0) + 1,
        updatedAt: new Date()
      });
      
      await loadTableData();
    });
  }, [collectionName, tableData.columns, executeAsync, loadTableData, tableId, tableData.rows.length]);

  const addColumn = useCallback(async (columnName, columnType) => {
    if (!collectionName) return;
    
    await executeAsync(async () => {
      const columnId = columnName.toLowerCase().replace(/\s+/g, '_');
      
      const tableCollectionRef = collection(db, collectionName);
      const querySnapshot = await getDocs(tableCollectionRef);
      
      const updatePromises = querySnapshot.docs.map(doc => {
        const docRef = doc.ref;
        return updateDoc(docRef, {
          [columnId]: COLUMN_TYPES[columnType].defaultValue,
          updatedAt: new Date()
        });
      });
      
      await Promise.all(updatePromises);
      
      // Update table metadata
      await updateDoc(doc(db, 'userTables', tableId), {
        columnCount: tableData.columns.length + 1,
        updatedAt: new Date()
      });
      
      await loadTableData();
    });
  }, [collectionName, executeAsync, loadTableData, tableId, tableData.columns.length]);

  const deleteColumn = useCallback(async (columnId) => {
    if (columnId === 'serialNo' || !collectionName) return;

    await executeAsync(async () => {
      const tableCollectionRef = collection(db, collectionName);
      const querySnapshot = await getDocs(tableCollectionRef);
      
      const updatePromises = querySnapshot.docs.map(doc => {
        const docRef = doc.ref;
        const data = doc.data();
        
        const { [columnId]: deletedField, ...remainingData } = data;
        
        return updateDoc(docRef, {
          ...remainingData,
          updatedAt: new Date()
        });
      });
      
      await Promise.all(updatePromises);
      
      // Update table metadata
      await updateDoc(doc(db, 'userTables', tableId), {
        columnCount: Math.max(1, tableData.columns.length - 1),
        updatedAt: new Date()
      });
      
      await loadTableData();
    });
  }, [collectionName, executeAsync, loadTableData, tableId, tableData.columns.length]);

  

  const deleteRow = useCallback(async (rowId) => {
    if (!collectionName) return;
    
    await executeAsync(async () => {
      const docRef = doc(db, collectionName, rowId);
      await deleteDoc(docRef);
      
      const tableCollectionRef = collection(db, collectionName);
      const q = query(tableCollectionRef, orderBy('serialNo', 'asc'));
      const querySnapshot = await getDocs(q);
      
      const updatePromises = querySnapshot.docs.map((doc, index) => {
        return updateDoc(doc.ref, {
          serialNo: index + 1,
          updatedAt: new Date()
        });
      });
      
      await Promise.all(updatePromises);
      
      // Update table metadata
      await updateDoc(doc(db, 'userTables', tableId), {
        rowCount: querySnapshot.docs.length,
        updatedAt: new Date()
      });
      
      await loadTableData();
    });
  }, [collectionName, executeAsync, loadTableData, tableId]);

  const updateCell = useCallback(async (rowId, columnId, value) => {
    if (!collectionName) return;
    
    await executeAsync(async () => {
      const docRef = doc(db, collectionName, rowId);
      await updateDoc(docRef, {
        [columnId]: value,
        updatedAt: new Date()
      });
      
      await loadTableData();
    });
  }, [collectionName, executeAsync, loadTableData]);

  return {
    tableData,
    loading,
    error,
    clearError,
    loadTableData,
    addColumn,
    deleteColumn,
    addRow,
    deleteRow,
    updateCell,
    collectionName,
    tableName
  };
}

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
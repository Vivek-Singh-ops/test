
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Tabs,
  Tab,
  Alert,
  LinearProgress,
  Chip,
  Divider,
  FormControlLabel,
  Checkbox,
  Link
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CloudDownload as DownloadIcon,
  InsertDriveFile as FileIcon,
  Preview as PreviewIcon
} from '@mui/icons-material';
import { 
  exportToCSV, 
  exportToJSON, 
  importFromCSV, 
  importFromJSON, 
  importFromExcel
} from '../utils/exportUtils';

function ImportExportDialog({ open, onClose, collectionName, tableName, onImportSuccess }) {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [fileName, setFileName] = useState('');
  const [appendData, setAppendData] = useState(true);

  const handleExport = async (format) => {
    try {
      setLoading(true);
      setError('');
      
      switch (format) {
        case 'csv':
          await exportToCSV(collectionName, tableName);
          setSuccess('CSV exported successfully!');
          break;
        case 'json':
          await exportToJSON(collectionName, tableName);
          setSuccess('JSON exported successfully!');
          break;
        default:
          throw new Error('Unsupported format');
      }
    } catch (err) {
      setError('Export failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (file) => {
    try {
      setSelectedFile(file);
      setFileName(file.name);
      
      // Create a preview URL for the file
      const url = URL.createObjectURL(file);
      setFilePreviewUrl(url);
      setError('');
    } catch (err) {
      setError('Failed to process file: ' + err.message);
    }
  };

  const handleConfirmImport = async () => {
    if (!selectedFile) return;
    
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      
      const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
      let result;
      
      switch (fileExtension) {
        case 'csv':
          result = await importFromCSV(selectedFile, collectionName, appendData);
          break;
        case 'json':
          result = await importFromJSON(selectedFile, collectionName, appendData);
          break;
        case 'xlsx':
        case 'xls':
          result = await importFromExcel(selectedFile, collectionName, appendData);
          break;
        default:
          throw new Error('Unsupported file format.');
      }
      
      const actionText = appendData ? 'appended' : 'imported';
      setSuccess(`Successfully ${actionText} ${result.imported} rows!`);
      setFilePreviewUrl(null);
      setSelectedFile(null);
      onImportSuccess(result);
      
    } catch (err) {
      setError('Import failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
    e.target.value = '';
  };

  const handleClose = () => {
    setError('');
    setSuccess('');
    setTab(0);
    setFilePreviewUrl(null);
    setSelectedFile(null);
    setFileName('');
    setAppendData(true);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import & Export Data</DialogTitle>
      
      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)}>
            <Tab icon={<DownloadIcon />} label="Export" />
            <Tab icon={<UploadIcon />} label="Import" />
          </Tabs>
        </Box>

        {loading && <LinearProgress sx={{ mb: 2 }} />}
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        {tab === 0 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Export Table Data
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Download your table data in various formats
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                startIcon={<FileIcon />}
                onClick={() => handleExport('csv')}
                disabled={loading}
                sx={{ minWidth: 120 }}
              >
                Export CSV
              </Button>
              
              <Button
                variant="outlined"
                startIcon={<FileIcon />}
                onClick={() => handleExport('json')}
                disabled={loading}
                sx={{ minWidth: 120 }}
              >
                Export JSON
              </Button>
            </Box>
            
            <Divider sx={{ my: 3 }} />
            
            <Typography variant="body2" color="text.secondary">
              <strong>CSV:</strong> Compatible with Excel, Google Sheets<br/>
              <strong>JSON:</strong> Complete data structure with column types
            </Typography>
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Import Table Data
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Upload a file to import data
            </Typography>
            
            <FormControlLabel
              control={
                <Checkbox
                  checked={appendData}
                  onChange={(e) => setAppendData(e.target.checked)}
                />
              }
              label="Append to existing data (unchecked will replace all data)"
              sx={{ mb: 2 }}
            />
            
            {!appendData && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                <strong>Warning:</strong> This will replace all existing data in this table.
              </Alert>
            )}
            
            {!filePreviewUrl ? (
              <Box
                onDrop={handleDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                sx={{
                  border: '2px dashed',
                  borderColor: dragOver ? 'primary.main' : 'grey.300',
                  borderRadius: 2,
                  p: 4,
                  textAlign: 'center',
                  bgcolor: dragOver ? 'action.hover' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  mb: 3
                }}
                onClick={() => document.getElementById('file-input').click()}
              >
                <PreviewIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Drop files here or click to browse
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Select a file to import
                </Typography>
                
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 2 }}>
                  <Chip label="CSV" size="small" variant="outlined" />
                  <Chip label="JSON" size="small" variant="outlined" />
                  <Chip label="Excel" size="small" variant="outlined" />
                </Box>
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', mb: 3 }}>
                <FileIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  File Ready for Import
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {fileName}
                </Typography>
                <Link
                  href={filePreviewUrl}
                  target="_blank"
                  rel="noopener"
                  download={fileName}
                  sx={{ cursor: 'pointer' }}
                >
                  Preview File
                </Link>
              </Box>
            )}
            
            <input
              id="file-input"
              type="file"
              accept=".csv,.json,.xlsx,.xls"
              onChange={handleFileInput}
              style={{ display: 'none' }}
            />
            
            <Divider sx={{ my: 3 }} />
            
            <Typography variant="body2" color="text.secondary">
              <strong>Import Process:</strong><br/>
              1. Select or drop a file<br/>
              2. Preview the file by clicking the link<br/>
              3. Confirm to import<br/>
              4. Data will be added to your table
            </Typography>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        {tab === 1 && selectedFile && (
          <>
            <Button onClick={() => {
              setFilePreviewUrl(null);
              setSelectedFile(null);
              setFileName('');
            }}>
              Change File
            </Button>
            <Button 
              onClick={handleConfirmImport} 
              variant="contained"
              disabled={loading}
            >
              {appendData ? 'Append Data' : 'Replace Data'}
            </Button>
          </>
        )}
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default ImportExportDialog;

'use client';

import { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
} from '@mui/material';
import axios from 'axios';
import type { Contract } from '@prisma/client';

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState('Preparing to upload...');

  // Load contracts on component mount
  useEffect(() => {
    fetchContracts();
  }, []);

  // Set up polling to refresh contracts list
  useEffect(() => {
    const interval = setInterval(() => {
      fetchContracts(); // Poll for all contracts every 2 seconds
      console.log('Polling for contracts...'); // Add logging to verify polling
    }, 2000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []); // Remove dependency on loading to always poll

  const fetchContracts = async () => {
    try {
      const response = await axios.get('/api/contracts');
      setContracts(response.data);
    } catch (error) {
      console.error('Error fetching contracts:', error);
      setError('Failed to load contracts');
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file to upload');
      return;
    }

    const formData = new FormData();
    formData.append('pdf', selectedFile);

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    setProcessingStatus('Uploading file...');

    try {
      const response = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Check if the upload was successful
      if (response.data.contractId) {
        setSuccessMessage(
          `File "${selectedFile.name}" uploaded successfully. Extraction will begin shortly.`,
        );
        setSelectedFile(null); // Clear the selected file
        fetchContracts(); // Refresh the contracts list
      } else {
        // If we got a response but no contract ID, processing is already done
        fetchContracts();
      }
      setLoading(false);
    } catch (error) {
      console.error('Error uploading file:', error);
      setError('Failed to upload file');
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Contract Clause Extractor
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {successMessage && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {successMessage}
          </Alert>
        )}

        <Paper sx={{ p: 2, mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Upload Contract PDF
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Button variant="contained" component="label" sx={{ mr: 2 }}>
              Select File
              <input type="file" hidden accept="application/pdf" onChange={handleFileChange} />
            </Button>
            <Typography variant="body1">
              {selectedFile ? selectedFile.name : 'No file selected'}
            </Typography>
          </Box>

          <Button
            variant="contained"
            color="primary"
            onClick={handleUpload}
            disabled={!selectedFile || loading}
          >
            Upload and Extract
          </Button>

          {loading && (
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center' }}>
              <CircularProgress size={24} sx={{ mr: 2 }} />
              <Typography variant="body2">{processingStatus}</Typography>
            </Box>
          )}
        </Paper>

        <Typography variant="h5" gutterBottom>
          Extracted Clauses
        </Typography>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Contract Name</TableCell>
                <TableCell>Upload Date</TableCell>
                <TableCell>Indemnification Clause</TableCell>
                <TableCell>Termination Clause</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {contracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell>{contract.fileName}</TableCell>
                  <TableCell>{new Date(contract.uploadedAt).toLocaleString()}</TableCell>
                  <TableCell>
                    {contract.indemnificationText
                      ? contract.indemnificationText.length > 100
                        ? contract.indemnificationText.substring(0, 100) + '...'
                        : contract.indemnificationText
                      : ''}
                  </TableCell>
                  <TableCell>
                    {contract.terminationText
                      ? contract.terminationText.length > 100
                        ? contract.terminationText.substring(0, 100) + '...'
                        : contract.terminationText
                      : ''}
                  </TableCell>
                  <TableCell>
                    {contract.status === 'pending' || contract.status === 'processing' ? (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <CircularProgress size={20} sx={{ mr: 1 }} />
                        {contract.status === 'pending' ? 'Pending' : `Processing`}
                      </Box>
                    ) : (
                      contract.status
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {contracts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    No contracts processed yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Container>
  );
}

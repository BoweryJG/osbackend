import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Initialize OpenAI client - OpenRouter disabled
const openAiApiKey = process.env.OPENAI_API_KEY;
let openai = null;

if (!openAiApiKey) {
  console.warn('No OpenAI API key configured. Transcription features will be disabled.');
} else {
  const openAiOptions = { apiKey: openAiApiKey };

  openai = new OpenAI(openAiOptions);
}

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Bucket name for audio files
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'audio_recordings';

/**
 * Ensure the storage bucket exists
 */
async function ensureStorageBucket() {
  try {
    // Check if bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets.some(bucket => bucket.name === STORAGE_BUCKET);
    
    if (!bucketExists) {
      console.log(`Creating storage bucket: ${STORAGE_BUCKET}`);
      const { data, error } = await supabase.storage.createBucket(STORAGE_BUCKET, {
        public: false,
        allowedMimeTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || [
          'audio/mpeg',
          'audio/wav',
          'audio/mp4',
          'audio/webm',
          'audio/ogg'
        ],
        fileSizeLimit: parseInt(process.env.MAX_FILE_SIZE || '50000000') // 50MB default
      });
      
      if (error) {
        console.error('Error creating storage bucket:', error);
        throw error;
      }
      
      console.log('Storage bucket created successfully');
    } else {
      console.log(`Storage bucket ${STORAGE_BUCKET} already exists`);
    }
    
    return true;
  } catch (err) {
    console.error('Error ensuring storage bucket exists:', err);
    throw err;
  }
}

/**
 * Upload a file to Supabase storage
 * @param {string} userId - The user ID
 * @param {object} file - The file object from multer
 * @returns {Promise<string>} - The URL of the uploaded file
 */
async function uploadFileToStorage(userId, file) {
  try {
    // Ensure bucket exists
    await ensureStorageBucket();
    
    // Generate a unique filename
    const fileExtension = path.extname(file.originalname);
    const uniqueFilename = `${userId}/${uuidv4()}${fileExtension}`;
    
    // Upload file to Supabase storage
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(uniqueFilename, fs.createReadStream(file.path), {
        contentType: file.mimetype,
        cacheControl: '3600'
      });
    
    if (error) {
      console.error('Error uploading file to storage:', error);
      throw error;
    }
    
    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(uniqueFilename);
    
    // Clean up the temporary file
    fs.unlinkSync(file.path);
    
    return {
      url: publicUrl,
      path: uniqueFilename,
      filename: file.originalname
    };
  } catch (err) {
    console.error('Error uploading file to storage:', err);
    // Clean up the temporary file if it exists
    if (file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    throw err;
  }
}

/**
 * Transcribe an audio file using OpenAI Whisper API
 * @param {string} fileUrl - The URL of the audio file
 * @returns {Promise<object>} - The transcription result
 */
async function transcribeAudio(fileUrl) {
  try {
    if (!openai) {
      throw new Error('OpenAI API key not configured');
    }
    console.log(`Transcribing audio file: ${fileUrl}`);
    
    // Download the file if it's a URL (not a local file path)
    let fileToTranscribe = fileUrl;
    let tempFilePath = null;
    
    // Check if it's a URL (starts with http:// or https://)
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      // Create temp directory if it doesn't exist
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Generate temp file path
      tempFilePath = path.join(tempDir, `${uuidv4()}.mp3`);
      
      if (fileUrl.includes(process.env.SUPABASE_URL)) {
      // Extract the path from the URL
      const urlParts = new URL(fileUrl);
      const pathParts = urlParts.pathname.split('/');
      const bucketName = pathParts[pathParts.length - 2];
      const filePath = pathParts[pathParts.length - 1];
      
      // Download the file to a temporary location
      tempFilePath = path.join(__dirname, 'temp', `${uuidv4()}.audio`);
      
      // Ensure temp directory exists
      if (!fs.existsSync(path.join(__dirname, 'temp'))) {
        fs.mkdirSync(path.join(__dirname, 'temp'), { recursive: true });
      }
      
      const { data, error } = await supabase.storage
        .from(bucketName)
        .download(filePath);
      
      if (error) {
        console.error('Error downloading file from Supabase:', error);
        throw error;
      }
      
      // Write the file to disk
      fs.writeFileSync(tempFilePath, Buffer.from(await data.arrayBuffer()));
      fileToTranscribe = tempFilePath;
      } else {
        // Download from external URL
        console.log('Downloading audio from external URL...');
        const response = await axios({
          method: 'GET',
          url: fileUrl,
          responseType: 'stream'
        });
        
        // Save to temp file
        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
        
        fileToTranscribe = tempFilePath;
        console.log('Audio downloaded successfully to:', tempFilePath);
      }
    }
    
    // Transcribe the audio using OpenAI Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(fileToTranscribe),
      model: "whisper-1",
      response_format: "verbose_json",
      temperature: 0.2,
    });
    
    // Clean up temporary file if it exists
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    
    return {
      text: transcription.text,
      duration: transcription.duration,
      segments: transcription.segments,
      language: transcription.language
    };
  } catch (err) {
    console.error('Error transcribing audio:', err);
    // Clean up temporary file if it exists
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupErr) {
        console.error('Error cleaning up temp file:', cleanupErr);
      }
    }
    throw err;
  }
}

/**
 * Analyze transcription - OpenRouter disabled
 * @param {string} transcription - The transcription text
 * @returns {Promise<string>} - The analysis result
 */
async function analyzeTranscription(transcription) {
  try {
    if (!openai) {
      throw new Error('OpenAI API key not configured');
    }
    
    console.log('Analyzing transcription with OpenAI GPT-4...');
    
    const prompt = `Analyze the following conversation transcript:
    
    ${transcription}
    
    Please provide insights on:
    1. Key points discussed
    2. Customer pain points
    3. Objections raised
    4. Next steps
    5. Overall sentiment
    
    Format your response in markdown with clear headings for each section.`;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are an expert sales conversation analyzer.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5,
      max_tokens: 1000
    });
    
    return response.choices[0].message.content;
  } catch (err) {
    console.error('Error analyzing transcription:', err);
    throw err;
  }
}

/**
 * Save transcription to Supabase
 * @param {string} userId - The user ID
 * @param {string} filename - The original filename
 * @param {string} fileUrl - The URL of the uploaded file
 * @param {object} transcriptionResult - The transcription result
 * @param {string} analysis - The analysis result
 * @returns {Promise<object>} - The saved transcription record
 */
async function saveTranscription(userId, filename, fileUrl, transcriptionResult, analysis) {
  try {
    const { data, error } = await supabase
      .from('transcriptions')
      .insert([{
        user_id: userId,
        filename: filename,
        file_url: fileUrl,
        transcription: transcriptionResult.text,
        duration_seconds: Math.ceil(transcriptionResult.duration || 0),
        analysis: analysis,
        status: 'completed'
      }])
      .select();
    
    if (error) {
      console.error('Error saving transcription to Supabase:', error);
      throw error;
    }
    
    return data[0];
  } catch (err) {
    console.error('Error saving transcription:', err);
    throw err;
  }
}

/**
 * Process an audio file: upload, transcribe, analyze, and save
 * @param {string} userId - The user ID
 * @param {object} file - The file object from multer
 * @returns {Promise<object>} - The processing result
 */
export async function processAudioFile(userId, file) {
  try {
    // Step 1: Upload file to Supabase storage
    console.log('Uploading file to Supabase storage');
    const uploadResult = await uploadFileToStorage(userId, file);
    
    // Step 2: Create a pending transcription record
    const { data: pendingRecord, error: pendingError } = await supabase
      .from('transcriptions')
      .insert([{
        user_id: userId,
        filename: uploadResult.filename,
        file_url: uploadResult.url,
        status: 'processing'
      }])
      .select();
    
    if (pendingError) {
      console.error('Error creating pending transcription record:', pendingError);
      throw pendingError;
    }
    
    try {
      // Step 3: Transcribe the audio
      console.log('Transcribing audio');
      const transcriptionResult = await transcribeAudio(uploadResult.url);
      
      // Step 4: Analyze the transcription
      console.log('Analyzing transcription');
      const analysisResult = await analyzeTranscription(transcriptionResult.text);
      
      // Step 5: Update the transcription record
      const { data: updatedRecord, error: updateError } = await supabase
        .from('transcriptions')
        .update({
          transcription: transcriptionResult.text,
          duration_seconds: Math.ceil(transcriptionResult.duration || 0),
          analysis: analysisResult,
          status: 'completed'
        })
        .eq('id', pendingRecord[0].id)
        .select();
      
      if (updateError) {
        console.error('Error updating transcription record:', updateError);
        throw updateError;
      }
      
      return {
        success: true,
        transcription: updatedRecord[0]
      };
    } catch (processingError) {
      // Update the record with the error
      await supabase
        .from('transcriptions')
        .update({
          status: 'error',
          error: processingError.message
        })
        .eq('id', pendingRecord[0].id);
      
      throw processingError;
    }
  } catch (err) {
    console.error('Error processing audio file:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Process audio from a URL
 * @param {string} userId - The user ID
 * @param {string} fileUrl - The URL of the audio file
 * @param {string} filename - The original filename
 * @returns {Promise<Object>} - The result of the transcription
 */
export async function processAudioFromUrl(userId, fileUrl, filename) {
  try {
    console.log('Starting processAudioFromUrl:', { userId, fileUrl, filename });
    
    // Step 1: Create a pending transcription record
    const insertData = {
      user_id: userId,
      filename: filename || 'audio_file.mp3',
      file_url: fileUrl,
      status: 'processing',
      transcription: '',  // Use empty string instead of null
      analysis: {},       // Use empty object instead of null
      duration_seconds: 0 // Use 0 instead of null
    };
    
    console.log('Inserting transcription record:', insertData);
    
    const { data: pendingRecord, error: pendingError } = await supabase
      .from('transcriptions')
      .insert([insertData])
      .select();
    
    if (pendingError) {
      console.error('Error creating pending transcription record:', pendingError);
      console.error('Error details:', JSON.stringify(pendingError, null, 2));
      throw pendingError;
    }
    
    try {
      // Step 2: Transcribe the audio directly from URL
      console.log('Transcribing audio from URL:', fileUrl);
      const transcriptionResult = await transcribeAudio(fileUrl);
      
      // Step 3: Analyze the transcription
      console.log('Analyzing transcription');
      const analysisResult = await analyzeTranscription(transcriptionResult.text);
      
      // Step 4: Update the transcription record
      const { data: updatedRecord, error: updateError } = await supabase
        .from('transcriptions')
        .update({
          transcription: transcriptionResult.text,
          duration_seconds: Math.ceil(transcriptionResult.duration || 0),
          analysis: analysisResult,
          status: 'completed'
        })
        .eq('id', pendingRecord[0].id)
        .select();
      
      if (updateError) {
        console.error('Error updating transcription record:', updateError);
        throw updateError;
      }
      
      return {
        success: true,
        transcription: updatedRecord[0]
      };
    } catch (error) {
      // Update record to failed status
      await supabase
        .from('transcriptions')
        .update({
          status: 'failed',
          error_message: error.message
        })
        .eq('id', pendingRecord[0].id);
      
      throw error;
    }
  } catch (error) {
    console.error('Error processing audio from URL:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get transcriptions for a user
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} - The transcriptions
 */
export async function getUserTranscriptions(userId) {
  try {
    const { data, error } = await supabase
      .from('transcriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error getting user transcriptions:', error);
      throw error;
    }
    
    return data;
  } catch (err) {
    console.error('Error getting user transcriptions:', err);
    throw err;
  }
}

/**
 * Get a single transcription by ID
 * @param {string} transcriptionId - The transcription ID
 * @param {string} userId - The user ID (for authorization)
 * @returns {Promise<object>} - The transcription
 */
export async function getTranscriptionById(transcriptionId, userId) {
  try {
    const { data, error } = await supabase
      .from('transcriptions')
      .select('*')
      .eq('id', transcriptionId)
      .eq('user_id', userId)
      .single();
    
    if (error) {
      console.error('Error getting transcription by ID:', error);
      throw error;
    }
    
    return data;
  } catch (err) {
    console.error('Error getting transcription by ID:', err);
    throw err;
  }
}

/**
 * Delete a transcription by ID
 * @param {string} transcriptionId - The transcription ID
 * @param {string} userId - The user ID (for authorization)
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteTranscription(transcriptionId, userId) {
  try {
    // First get the transcription to get the file path
    const { data: transcription, error: getError } = await supabase
      .from('transcriptions')
      .select('file_url')
      .eq('id', transcriptionId)
      .eq('user_id', userId)
      .single();
    
    if (getError) {
      console.error('Error getting transcription for deletion:', getError);
      throw getError;
    }
    
    // Delete the record from the database
    const { error: deleteError } = await supabase
      .from('transcriptions')
      .delete()
      .eq('id', transcriptionId)
      .eq('user_id', userId);
    
    if (deleteError) {
      console.error('Error deleting transcription record:', deleteError);
      throw deleteError;
    }
    
    // Try to delete the file from storage if it's a Supabase URL
    if (transcription.file_url && transcription.file_url.includes(process.env.SUPABASE_URL)) {
      try {
        // Extract the path from the URL
        const urlParts = new URL(transcription.file_url);
        const pathParts = urlParts.pathname.split('/');
        const bucketName = pathParts[pathParts.length - 2];
        const filePath = pathParts[pathParts.length - 1];
        
        // Delete the file
        const { error: storageError } = await supabase.storage
          .from(bucketName)
          .remove([filePath]);
        
        if (storageError) {
          console.warn('Error deleting file from storage:', storageError);
          // Don't throw, just log the warning
        }
      } catch (storageErr) {
        console.warn('Error parsing file URL for deletion:', storageErr);
        // Don't throw, just log the warning
      }
    }
    
    return true;
  } catch (err) {
    console.error('Error deleting transcription:', err);
    throw err;
  }
}

export default {
  processAudioFile,
  processAudioFromUrl,
  getUserTranscriptions,
  getTranscriptionById,
  deleteTranscription,
  transcribeAudio,
  analyzeTranscription
};

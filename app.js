const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// AWS S3 configuration
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bucketName = process.env.S3_BUCKET_NAME;

// In-memory file storage for temporary handling of uploaded files
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Database connection - Using AWS RDS
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: true,
  }
};

// Connect to DB
let connection;
async function connectToDatabase() {
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to AWS RDS MySQL database');
    
    // Create products table if not exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        image_key VARCHAR(255)
      )
    `);
  } catch (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
}

// Helper function to upload file to S3
async function uploadFileToS3(file) {
  const fileId = uuidv4();
  const key = `products/${fileId}-${file.originalname.replace(/\s/g, '_')}`;
  
  const uploadParams = {
    Bucket: bucketName,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype
  };
  
  try {
    await s3Client.send(new PutObjectCommand(uploadParams));
    return key;
  } catch (err) {
    console.error('S3 upload error:', err);
    throw err;
  }
}

// Helper function to generate a signed URL for S3 objects
async function generateSignedUrl(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    });
    
    // URL expires in 1 hour
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  } catch (err) {
    console.error('Error generating signed URL:', err);
    return null;
  }
}

// Routes
app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await connection.execute('SELECT * FROM products');
    
    // Generate signed URLs for all product images
    const productsWithUrls = await Promise.all(rows.map(async (product) => {
      let imageUrl = null;
      if (product.image_key) {
        imageUrl = await generateSignedUrl(product.image_key);
      }
      return { ...product, image_url: imageUrl };
    }));
    
    res.json(productsWithUrls);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const [rows] = await connection.execute(
      'SELECT * FROM products WHERE id = ?',
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const product = rows[0];
    
    // Generate signed URL for the product image
    if (product.image_key) {
      product.image_url = await generateSignedUrl(product.image_key);
    }
    
    res.json(product);
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price } = req.body;
    let imageKey = null;
    
    // Upload image to S3 if provided
    if (req.file) {
      imageKey = await uploadFileToS3(req.file);
    }
    
    const [result] = await connection.execute(
      'INSERT INTO products (name, description, price, image_key) VALUES (?, ?, ?, ?)',
      [name, description, price, imageKey]
    );
    
    // Generate signed URL for the uploaded image
    let imageUrl = null;
    if (imageKey) {
      imageUrl = await generateSignedUrl(imageKey);
    }
    
    res.status(201).json({
      id: result.insertId,
      name,
      description,
      price,
      image_key: imageKey,
      image_url: imageUrl
    });
  } catch (err) {
    console.error('Error creating product:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint for AWS load balancer
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Start server
async function startServer() {
  await connectToDatabase();
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer();
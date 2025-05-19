# Cloud-Native Product API

A product catalog API deployed on AWS using RDS for database and S3 for file storage.

## Architecture

This application uses:
- AWS RDS MySQL for database storage
- AWS S3 for product image storage
- AWS EC2 (or ECS/EKS) for application hosting
- AWS Elastic Load Balancer for traffic distribution

## Environment Variables

This application requires the following environment variables:

```
DB_HOST=your-rds-endpoint.region.rds.amazonaws.com
DB_USER=admin
DB_PASSWORD=your-secure-password
DB_NAME=productdb
S3_BUCKET_NAME=your-product-images-bucket
AWS_REGION=us-east-1
PORT=3000
```

## API Endpoints

- `GET /api/products` - List all products with signed S3 URLs for images
- `GET /api/products/:id` - Get a single product with signed S3 URL for image
- `POST /api/products` - Create a new product (accepts multipart form with image)
- `GET /health` - Health check endpoint for load balancer

## Deployment

This application is designed to be deployed on AWS EC2 instances within an Auto Scaling Group behind an Application Load Balancer.

### Required AWS Resources

1. RDS MySQL database
2. S3 bucket for image storage
3. EC2 instances with proper IAM role for S3 access
4. Application Load Balancer
5. Auto Scaling Group

See the Terraform files in the `/terraform` directory for infrastructure code.
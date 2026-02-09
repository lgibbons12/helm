"""S3 service for PDF storage and retrieval."""

import boto3
from botocore.exceptions import ClientError

from app.config import get_settings

settings = get_settings()


class S3Service:
    """Service for interacting with AWS S3 for brain storage."""

    def __init__(self):
        """Initialize S3 client with credentials from settings."""
        client_kwargs = {
            "aws_access_key_id": settings.aws_access_key_id,
            "aws_secret_access_key": settings.aws_secret_access_key,
            "region_name": settings.aws_s3_region,
        }
        # Support MinIO / LocalStack by pointing to a custom endpoint
        if settings.aws_s3_endpoint_url:
            client_kwargs["endpoint_url"] = settings.aws_s3_endpoint_url

        self.s3_client = boto3.client("s3", **client_kwargs)
        self.bucket = settings.aws_s3_bucket

    async def generate_presigned_upload_url(
        self,
        file_key: str,
        content_type: str = "application/pdf",
        expiration: int = 300,
    ) -> dict:
        """
        Generate presigned URL for direct S3 upload from client.

        Args:
            file_key: S3 object key (path) for the file
            content_type: MIME type of the file (default: application/pdf)
            expiration: URL expiration time in seconds (default: 300/5 minutes)

        Returns:
            Dictionary with presigned POST data including url and fields

        Raises:
            ClientError: If S3 operation fails
        """
        try:
            return self.s3_client.generate_presigned_post(
                self.bucket,
                file_key,
                Fields={"Content-Type": content_type},
                Conditions=[
                    {"Content-Type": content_type},
                    ["content-length-range", 1, settings.max_pdf_size_bytes],
                ],
                ExpiresIn=expiration,
            )
        except ClientError as e:
            raise Exception(f"Failed to generate presigned URL: {str(e)}") from e

    async def download_pdf(self, file_key: str) -> bytes:
        """
        Download PDF from S3.

        Args:
            file_key: S3 object key (path) for the file

        Returns:
            Raw bytes of the PDF file

        Raises:
            ClientError: If S3 operation fails
        """
        try:
            response = self.s3_client.get_object(Bucket=self.bucket, Key=file_key)
            return response["Body"].read()
        except ClientError as e:
            raise Exception(f"Failed to download PDF from S3: {str(e)}") from e

    async def delete_pdf(self, file_key: str) -> None:
        """
        Delete PDF from S3.

        Args:
            file_key: S3 object key (path) for the file

        Raises:
            ClientError: If S3 operation fails
        """
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=file_key)
        except ClientError as e:
            raise Exception(f"Failed to delete PDF from S3: {str(e)}") from e

    async def upload_pdf(self, file_key: str, file_data: bytes) -> None:
        """
        Upload PDF directly to S3 (server-side upload).

        Args:
            file_key: S3 object key (path) for the file
            file_data: Raw bytes of the PDF file

        Raises:
            ClientError: If S3 operation fails
        """
        try:
            self.s3_client.put_object(
                Bucket=self.bucket,
                Key=file_key,
                Body=file_data,
                ContentType="application/pdf",
            )
        except ClientError as e:
            raise Exception(f"Failed to upload PDF to S3: {str(e)}") from e

    def check_file_exists(self, file_key: str) -> bool:
        """
        Check if a file exists in S3.

        Args:
            file_key: S3 object key (path) for the file

        Returns:
            True if file exists, False otherwise
        """
        try:
            self.s3_client.head_object(Bucket=self.bucket, Key=file_key)
            return True
        except ClientError:
            return False


# Singleton instance
s3_service = S3Service()

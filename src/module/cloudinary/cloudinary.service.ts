import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  v2 as cloudinary,
  UploadApiResponse,
  UploadApiErrorResponse,
} from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
  constructor(private config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get('CLOUDINARY_NAME'),
      api_key: config.get('CLOUDINARY_API_KEY'),
      api_secret: config.get('CLOUDINARY_API_SECRET'),
      secure: true,
    });
  }

  async uploadFile(
    file: Express.Multer.File,
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        { folder: 'ebook_covers' }, // Ảnh sẽ nằm trong thư mục này trên mây
        (error, result) => {
          if (error) return reject(error);
          if (!result) {
            return reject(
              new Error('Cloudinary upload failed: Result is undefined'),
            );
          }
          resolve(result);
        },
      );
      streamifier.createReadStream(file.buffer).pipe(upload);
    });
  }
  async getBufferFromUrl(url: string): Promise<Buffer> {
    const response = await fetch(url); // Node.js 18+ đã có sẵn fetch
    if (!response.ok) throw new Error(`Cannot downloaded image: ${url}`);
    const arrayBuffer = await response.arrayBuffer();
    console.log(' down image: ', arrayBuffer);
    return Buffer.from(arrayBuffer);
  }
}

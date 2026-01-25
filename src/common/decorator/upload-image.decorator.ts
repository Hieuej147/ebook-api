import {
  applyDecorators,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

export function UploadImage(fieldName: string = 'image') {
  return applyDecorators(
    UseInterceptors(
      FileInterceptor(fieldName, {
        limits: {
          fileSize: 2 * 1024 * 1024, // Giới hạn 2MB
        },
        fileFilter: (req, file, cb) => {
          // Kiểm tra định dạng file
          if (!file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
            return cb(
              new BadRequestException(
                'Only image files (jpg, jpeg, png, gif) are allowed!',
              ),
              false,
            );
          }
          cb(null, true);
        },
      }),
    ),
  );
}

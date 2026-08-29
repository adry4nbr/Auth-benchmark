/*
  Warnings:

  - The primary key for the `password_resets` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `refresh_tokens` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `id` on the `password_resets` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `refresh_tokens` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `user_id` on the `refresh_tokens` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `users` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable: converte o tipo da coluna preservando os dados existentes
ALTER TABLE "users" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;

ALTER TABLE "password_resets" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;

ALTER TABLE "refresh_tokens" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "refresh_tokens" ALTER COLUMN "user_id" TYPE UUID USING "user_id"::UUID;

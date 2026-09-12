-- V1__create_initial_schema.sql
-- Schema inicial do backend Spring Boot (auth-benchmark), espelhando o estado
-- que o Hibernate (ddl-auto=update) já havia gerado a partir das entidades JPA.

CREATE TABLE users (
                       id                   UUID PRIMARY KEY,
                       name                 VARCHAR(255) NOT NULL,
                       email                VARCHAR(255) NOT NULL,
                       password             VARCHAR(255),
                       role                 VARCHAR(255) NOT NULL,
                       two_factor_secret    VARCHAR(255),
                       two_factor_enabled   BOOLEAN NOT NULL,
                       created_at           TIMESTAMP(6) NOT NULL,
                       updated_at           TIMESTAMP(6) NOT NULL,

                       CONSTRAINT uk_users_email UNIQUE (email),
                       CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'USER'))
);

CREATE TABLE password_resets (
                                 id           UUID PRIMARY KEY,
                                 email        VARCHAR(255) NOT NULL,
                                 token_hash   VARCHAR(255) NOT NULL,
                                 expires_at   TIMESTAMP(6) NOT NULL,
                                 created_at   TIMESTAMP(6) NOT NULL
);

CREATE INDEX idx_password_resets_email ON password_resets (email);

CREATE TABLE refresh_tokens (
                                id           UUID PRIMARY KEY,
                                token_hash   VARCHAR(255) NOT NULL,
                                user_id      UUID NOT NULL,
                                expires_at   TIMESTAMP(6) NOT NULL,
                                created_at   TIMESTAMP(6) NOT NULL,

                                CONSTRAINT uk_refresh_tokens_token_hash UNIQUE (token_hash)
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);
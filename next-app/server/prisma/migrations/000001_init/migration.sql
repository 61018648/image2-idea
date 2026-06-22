-- CreateTable
CREATE TABLE `user_accounts` (
    `id` VARCHAR(128) NOT NULL,
    `email` VARCHAR(191) NULL,
    `password_hash` VARCHAR(255) NULL,
    `display_name` VARCHAR(191) NULL,
    `role` VARCHAR(32) NOT NULL DEFAULT 'user',
    `status` VARCHAR(32) NOT NULL DEFAULT 'active',
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_accounts_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `balances` (
    `user_id` VARCHAR(128) NOT NULL,
    `available_credits` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plans` (
    `id` VARCHAR(128) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `credits` INTEGER NOT NULL,
    `price_cents` INTEGER NOT NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'USD',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(128) NOT NULL,
    `user_id` VARCHAR(128) NOT NULL,
    `plan_id` VARCHAR(128) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
    `amount_cents` INTEGER NOT NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'USD',
    `credits` INTEGER NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `provider_order_id` VARCHAR(191) NULL,
    `provider_payment_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paid_at` DATETIME(3) NULL,

    INDEX `orders_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_ledger` (
    `id` VARCHAR(128) NOT NULL,
    `user_id` VARCHAR(128) NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `amount` INTEGER NOT NULL,
    `balance_after` INTEGER NOT NULL,
    `source` VARCHAR(32) NOT NULL,
    `source_id` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `credit_ledger_source_id_key`(`source_id`),
    INDEX `credit_ledger_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_events` (
    `id` VARCHAR(128) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `provider_event_id` VARCHAR(128) NOT NULL,
    `order_id` VARCHAR(128) NULL,
    `processed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `raw` JSON NOT NULL,

    UNIQUE INDEX `payment_events_provider_provider_event_id_key`(`provider`, `provider_event_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `generation_jobs` (
    `id` VARCHAR(128) NOT NULL,
    `user_id` VARCHAR(128) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'queued',
    `prompt` TEXT NOT NULL,
    `request_params` JSON NOT NULL,
    `input_image_data` JSON NOT NULL,
    `mask_data_url` LONGTEXT NULL,
    `cost_credits` INTEGER NOT NULL,
    `images` JSON NOT NULL,
    `raw_image_urls` JSON NULL,
    `revised_prompts` JSON NULL,
    `actual_params` JSON NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,

    INDEX `generation_jobs_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `generation_jobs_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `balances` ADD CONSTRAINT `balances_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_ledger` ADD CONSTRAINT `credit_ledger_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generation_jobs` ADD CONSTRAINT `generation_jobs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

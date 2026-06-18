-- Latest backup for image-test
-- Exported at 2026-06-18T10:31:45.272Z
SET NAMES utf8;
SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS `_prisma_migrations`;
CREATE TABLE `_prisma_migrations` (
  `id` varchar(36) NOT NULL,
  `checksum` varchar(64) NOT NULL,
  `finished_at` datetime default NULL,
  `migration_name` varchar(255) NOT NULL,
  `logs` text,
  `rolled_back_at` datetime default NULL,
  `started_at` datetime NOT NULL default '1970-01-01 00:00:00',
  `applied_steps_count` int(10) unsigned NOT NULL default '0',
  PRIMARY KEY  (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

INSERT INTO `_prisma_migrations` (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`) VALUES
('09a9bf77-f4eb-4ace-8e06-f8b58b24e45a', '2706dd9f87db11cea8df16d3cf09d0cbd85dfa7bd9fe52f80cb4a564b41fc8de', NULL, '000001_init', 'A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 000001_init\n\nDatabase error code: 1064\n\nDatabase error:\nYou have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near \'\"public\";\r\n\r\n-- CreateTable\r\nCREATE TABLE \"user_accounts\" (\r\n    \"id\" TEXT NOT N\' at line 2\n\nPlease check the query number 1 from the migration file.\n\n', '2026-06-17 16:23:45', '2026-06-17 16:18:52', 0),
('5ecfe124-769f-4fc6-aa3d-6e1ac91f0eb9', '3cd568a11ed6109eb70949137a6394b7247edc9d28305589b2b572f64ba77f68', NULL, '000001_init', 'A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 000001_init\n\nDatabase error code: 1071\n\nDatabase error:\nSpecified key was too long; max key length is 1000 bytes\n\nPlease check the query number 6 from the migration file.\n\n', '2026-06-17 16:27:34', '2026-06-17 16:24:00', 0),
('3459a85e-02f1-4fe6-a874-e478598b7bbb', '8510cfac8c8f3f474de1db54ecf24c27a4a8c0f98d936bd6727fc339a609f5d9', '2026-06-17 16:28:55', '000001_init', NULL, NULL, '2026-06-17 16:28:55', 1);

DROP TABLE IF EXISTS `balances`;
CREATE TABLE `balances` (
  `user_id` varchar(128) NOT NULL,
  `available_credits` int(11) NOT NULL default '0',
  `updated_at` datetime NOT NULL default '1970-01-01 00:00:00',
  PRIMARY KEY  (`user_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

INSERT INTO `balances` (`user_id`, `available_credits`, `updated_at`) VALUES
('1001', 0, '2026-06-17 16:36:01'),
('1002', 100, '2026-06-17 16:36:32'),
('1003', 0, '2026-06-17 22:51:38'),
('1004', 50, '2026-06-18 10:05:17'),
('1005', 0, '2026-06-18 04:06:15'),
('1006', 0, '2026-06-18 05:54:35'),
('1007', 0, '2026-06-18 05:55:13'),
('1008', 0, '2026-06-18 05:55:36'),
('1009', 0, '2026-06-18 06:20:24');

DROP TABLE IF EXISTS `credit_ledger`;
CREATE TABLE `credit_ledger` (
  `id` varchar(128) NOT NULL,
  `user_id` varchar(128) NOT NULL,
  `type` varchar(32) NOT NULL,
  `amount` int(11) NOT NULL,
  `balance_after` int(11) NOT NULL,
  `source` varchar(32) NOT NULL,
  `source_id` varchar(191) default NULL,
  `description` text,
  `created_at` datetime NOT NULL default '1970-01-01 00:00:00',
  PRIMARY KEY  (`id`),
  UNIQUE KEY `credit_ledger_source_id_key` (`source_id`),
  KEY `credit_ledger_user_id_created_at_idx` (`user_id`,`created_at`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

INSERT INTO `credit_ledger` (`id`, `user_id`, `type`, `amount`, `balance_after`, `source`, `source_id`, `description`, `created_at`) VALUES
('led_85w101qg', '1002', 'purchase', 100, 100, 'payment_notify', 'ord_8sny02vi', 'Purchase dev-small', '2026-06-17 16:36:32'),
('led_om4nkpqw', '1004', 'grant', 1, 1, 'admin', 'admin_1vsg7hds', '后台修改用户余额', '2026-06-18 08:10:05'),
('led_qw3xagke', '1004', 'debit', -1, 0, 'image_generation', 'job_1004_mqj7zfhe_yaalgt', 'Image generation: 1 image(s)', '2026-06-18 08:10:18'),
('led_z7s03814', '1004', 'refund', 1, 1, 'image_generation', 'refund:job_1004_mqj7zfhe_yaalgt', 'Image generation failed refund', '2026-06-18 08:10:23'),
('led_a3tr0y3u', '1004', 'debit', -1, 0, 'image_generation', 'job_1004_mqj7zuib_osgzxy', 'Image generation: 1 image(s)', '2026-06-18 08:10:38'),
('led_mipzx9nw', '1004', 'refund', 1, 1, 'image_generation', 'refund:job_1004_mqj7zuib_osgzxy', 'Image generation failed refund', '2026-06-18 08:10:43'),
('led_e3z6s69j', '1004', 'debit', -1, 0, 'image_generation', 'job_1004_mqj81cgu_jy0qfm', 'Image generation: 1 image(s)', '2026-06-18 08:11:47'),
('led_7474nvem', '1004', 'refund', 1, 1, 'image_generation', 'refund:job_1004_mqj81cgu_jy0qfm', 'Image generation failed refund', '2026-06-18 08:11:53'),
('led_u92ph5r9', '1004', 'debit', -1, 0, 'image_generation', 'job_1004_mqj850zs_d4ccuh', 'Image generation: 1 image(s)', '2026-06-18 08:14:39'),
('led_92hhshz3', '1004', 'refund', 1, 1, 'image_generation', 'refund:job_1004_mqj850zs_d4ccuh', 'Image generation failed refund', '2026-06-18 08:14:44'),
('led_f230rkxt', '1004', 'debit', -1, 0, 'image_generation', 'job_1004_mqjabxbj_yjd8lu', 'Image generation: 1 image(s)', '2026-06-18 09:16:00'),
('led_956bc88x', '1004', 'refund', 1, 1, 'image_generation', 'refund:job_1004_mqjabxbj_yjd8lu', 'Image generation failed refund', '2026-06-18 09:18:07'),
('led_9mu0az6c', '1004', 'debit', -1, 0, 'image_generation', 'job_1004_mqjaexmw_mrsy8n', 'Image generation: 1 image(s)', '2026-06-18 09:18:21'),
('led_7i95lmuh', '1004', 'refund', 1, 1, 'image_generation', 'refund:job_1004_mqjaexmw_mrsy8n', 'Image generation failed refund', '2026-06-18 09:20:27'),
('led_vzs5eees', '1004', 'debit', -1, 0, 'image_generation', 'job_1004_mqjbg7wt_obnoj7', 'Image generation: 1 image(s)', '2026-06-18 09:47:20'),
('led_arhrm2xm', '1004', 'refund', 1, 1, 'image_generation', 'refund:job_1004_mqjbg7wt_obnoj7', 'Image generation failed refund', '2026-06-18 09:49:27'),
('led_v9ekptx2', '1004', 'debit', -1, 0, 'image_generation', 'job_1004_mqjbqm8y_ps44j4', 'Image generation: 1 image(s)', '2026-06-18 09:55:25'),
('led_mukpqnzv', '1004', 'refund', 1, 1, 'image_generation', 'refund:job_1004_mqjbqm8y_ps44j4', 'Image generation failed refund', '2026-06-18 09:57:32'),
('led_mgvtgx2i', '1004', 'grant', 49, 50, 'admin', 'admin_qhldg159', '后台修改用户积分', '2026-06-18 10:02:04'),
('led_5el9viy1', '1004', 'debit', -1, 49, 'image_generation', 'job_1004_mqjc0lka_6umfp8', 'Image generation: 1 image(s)', '2026-06-18 10:03:11'),
('led_wxxlb4yh', '1004', 'refund', 1, 50, 'image_generation', 'refund:job_1004_mqjc0lka_6umfp8', 'Image generation failed refund', '2026-06-18 10:05:17');

DROP TABLE IF EXISTS `generation_jobs`;
CREATE TABLE `generation_jobs` (
  `id` varchar(128) NOT NULL,
  `user_id` varchar(128) NOT NULL,
  `status` varchar(32) NOT NULL default 'queued',
  `prompt` text NOT NULL,
  `request_params` longtext NOT NULL,
  `input_image_data` longtext NOT NULL,
  `mask_data_url` longtext,
  `cost_credits` int(11) NOT NULL,
  `images` longtext NOT NULL,
  `raw_image_urls` longtext,
  `revised_prompts` longtext,
  `actual_params` longtext,
  `error_message` text,
  `created_at` datetime NOT NULL default '1970-01-01 00:00:00',
  `started_at` datetime default NULL,
  `finished_at` datetime default NULL,
  PRIMARY KEY  (`id`),
  KEY `generation_jobs_user_id_created_at_idx` (`user_id`,`created_at`),
  KEY `generation_jobs_status_created_at_idx` (`status`,`created_at`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

INSERT INTO `generation_jobs` (`id`, `user_id`, `status`, `prompt`, `request_params`, `input_image_data`, `mask_data_url`, `cost_credits`, `images`, `raw_image_urls`, `revised_prompts`, `actual_params`, `error_message`, `created_at`, `started_at`, `finished_at`) VALUES
('job_1004_mqj7zfhe_yaalgt', '1004', 'failed', '帮我生成一个API聚合站的电商主图', '{\"size\":\"auto\",\"quality\":\"auto\",\"output_format\":\"png\",\"output_compression\":null,\"moderation\":\"auto\",\"n\":1}', '[]', NULL, 1, '[]', NULL, NULL, NULL, 'Upstream image API request timed out', '2026-06-18 08:10:18', '2026-06-18 08:10:18', '2026-06-18 08:10:23'),
('job_1004_mqj7zuib_osgzxy', '1004', 'failed', '帮我生成一个API聚合站的电商主图', '{\"size\":\"auto\",\"quality\":\"auto\",\"output_format\":\"png\",\"output_compression\":null,\"moderation\":\"auto\",\"n\":1}', '[]', NULL, 1, '[]', NULL, NULL, NULL, 'Upstream image API request timed out', '2026-06-18 08:10:38', '2026-06-18 08:10:38', '2026-06-18 08:10:43'),
('job_1004_mqj81cgu_jy0qfm', '1004', 'failed', '帮我生成一个API聚合站的电商主图', '{\"size\":\"auto\",\"quality\":\"auto\",\"output_format\":\"png\",\"output_compression\":null,\"moderation\":\"auto\",\"n\":1}', '[]', NULL, 1, '[]', NULL, NULL, NULL, 'Upstream image API request timed out', '2026-06-18 08:11:48', '2026-06-18 08:11:48', '2026-06-18 08:11:53'),
('job_1004_mqj850zs_d4ccuh', '1004', 'failed', '帮我生成一个API聚合站的电商主图', '{\"size\":\"auto\",\"quality\":\"auto\",\"output_format\":\"png\",\"output_compression\":null,\"moderation\":\"auto\",\"n\":1}', '[]', NULL, 1, '[]', NULL, NULL, NULL, 'Upstream image API request timed out', '2026-06-18 08:14:39', '2026-06-18 08:14:39', '2026-06-18 08:14:44'),
('job_1004_mqjabxbj_yjd8lu', '1004', 'failed', '帮我生成一个API聚合站的电商主图', '{\"size\":\"auto\",\"quality\":\"auto\",\"output_format\":\"png\",\"output_compression\":null,\"moderation\":\"auto\",\"n\":1}', '[]', NULL, 1, '[]', NULL, NULL, NULL, 'fetch failed', '2026-06-18 09:16:00', '2026-06-18 09:16:00', '2026-06-18 09:18:07'),
('job_1004_mqjaexmw_mrsy8n', '1004', 'failed', '帮我生成一个API聚合站的电商主图', '{\"size\":\"auto\",\"quality\":\"auto\",\"output_format\":\"png\",\"output_compression\":null,\"moderation\":\"auto\",\"n\":1}', '[]', NULL, 1, '[]', NULL, NULL, NULL, 'fetch failed', '2026-06-18 09:18:21', '2026-06-18 09:18:21', '2026-06-18 09:20:27'),
('job_1004_mqjbg7wt_obnoj7', '1004', 'failed', '帮我生成一个API聚合站的电商主图', '{\"size\":\"auto\",\"quality\":\"auto\",\"output_format\":\"png\",\"output_compression\":null,\"moderation\":\"auto\",\"n\":1}', '[]', NULL, 1, '[]', NULL, NULL, NULL, '上游 API 连接失败：无法连接到 https://nexapi.tech/v1/images/generations。请检查后台 Base URL 是否只填写到 /v1、服务器是否能访问该地址、是否需要代理或证书配置。 原始原因：UND_ERR_SOCKET / other side closed', '2026-06-18 09:47:20', '2026-06-18 09:47:20', '2026-06-18 09:49:27'),
('job_1004_mqjbqm8y_ps44j4', '1004', 'failed', '帮我生成一个API聚合站的电商主图', '{\"size\":\"auto\",\"quality\":\"auto\",\"output_format\":\"png\",\"output_compression\":null,\"moderation\":\"auto\",\"n\":1}', '[]', NULL, 1, '[]', NULL, NULL, NULL, '上游 API 在生成完成前主动断开连接：https://nexapi.tech/v1/images/generations。这通常是上游网关/CDN 在约 120 秒左右关闭了长请求，不是浏览器或本站主动停止。建议在后台降低图片尺寸/质量，或联系上游提高 images 接口超时。 原始原因：UND_ERR_SOCKET / other side closed', '2026-06-18 09:55:25', '2026-06-18 09:55:26', '2026-06-18 09:57:32'),
('job_1004_mqjc0lka_6umfp8', '1004', 'failed', '帮我生成一个API聚合站的电商主图', '{\"size\":\"auto\",\"quality\":\"auto\",\"output_format\":\"png\",\"output_compression\":null,\"moderation\":\"auto\",\"n\":1}', '[]', NULL, 1, '[]', NULL, NULL, NULL, 'https://nexapi.tech/v1/images/generations 返回错误：openai_error', '2026-06-18 10:03:11', '2026-06-18 10:03:11', '2026-06-18 10:05:17');

DROP TABLE IF EXISTS `orders`;
CREATE TABLE `orders` (
  `id` varchar(128) NOT NULL,
  `user_id` varchar(128) NOT NULL,
  `plan_id` varchar(128) NOT NULL,
  `status` varchar(32) NOT NULL default 'pending',
  `amount_cents` int(11) NOT NULL,
  `currency` varchar(8) NOT NULL default 'USD',
  `credits` int(11) NOT NULL,
  `provider` varchar(32) NOT NULL,
  `provider_order_id` varchar(191) default NULL,
  `provider_payment_id` varchar(191) default NULL,
  `created_at` datetime NOT NULL default '1970-01-01 00:00:00',
  `paid_at` datetime default NULL,
  PRIMARY KEY  (`id`),
  KEY `orders_user_id_created_at_idx` (`user_id`,`created_at`),
  KEY `orders_plan_id_fkey` (`plan_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

INSERT INTO `orders` (`id`, `user_id`, `plan_id`, `status`, `amount_cents`, `currency`, `credits`, `provider`, `provider_order_id`, `provider_payment_id`, `created_at`, `paid_at`) VALUES
('ord_vq943xik', '1001', 'dev-small', 'pending', 500, 'CNY', 100, 'dev', NULL, NULL, '2026-06-17 16:36:01', NULL),
('ord_8sny02vi', '1002', 'dev-small', 'paid', 500, 'CNY', 100, 'dev', NULL, NULL, '2026-06-17 16:36:32', '2026-06-17 16:36:32'),
('ord_ghqfo50v', '1003', 'dev-medium', 'pending', 2000, 'CNY', 500, 'stripe', NULL, NULL, '2026-06-17 22:54:36', NULL),
('ord_gibyzqlu', '1006', 'dev-small', 'pending', 500, 'CNY', 100, 'stripe', NULL, NULL, '2026-06-18 05:54:37', NULL),
('ord_4zq77ryz', '1004', 'dev-small', 'pending', 500, 'CNY', 100, 'stripe', NULL, NULL, '2026-06-18 06:01:55', NULL),
('ord_95gwevze', '1004', 'dev-small', 'pending', 500, 'CNY', 100, 'stripe', NULL, NULL, '2026-06-18 06:02:01', NULL),
('ord_gu1ptbht', '1004', 'dev-free', 'pending', 0, 'CNY', 20, 'stripe', NULL, NULL, '2026-06-18 06:21:55', NULL),
('ord_00k86jv5', '1004', 'dev-small', 'pending', 500, 'CNY', 100, 'stripe', NULL, NULL, '2026-06-18 07:06:41', NULL),
('ord_9gesn1u5', '1004', 'dev-small', 'pending', 500, 'CNY', 100, 'epay', NULL, NULL, '2026-06-18 07:59:19', NULL),
('ord_ftehjzgc', '1004', 'dev-small', 'pending', 500, 'CNY', 100, 'epay', NULL, NULL, '2026-06-18 09:15:33', NULL),
('ord_7w2e99uw', '1004', 'dev-small', 'pending', 500, 'CNY', 100, 'epay', NULL, NULL, '2026-06-18 10:02:32', NULL);

DROP TABLE IF EXISTS `payment_events`;
CREATE TABLE `payment_events` (
  `id` varchar(128) NOT NULL,
  `provider` varchar(32) NOT NULL,
  `provider_event_id` varchar(128) NOT NULL,
  `order_id` varchar(128) default NULL,
  `processed_at` datetime NOT NULL default '1970-01-01 00:00:00',
  `raw` longtext NOT NULL,
  PRIMARY KEY  (`id`),
  UNIQUE KEY `payment_events_provider_provider_event_id_key` (`provider`,`provider_event_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

INSERT INTO `payment_events` (`id`, `provider`, `provider_event_id`, `order_id`, `processed_at`, `raw`) VALUES
('evt_33imd3e4', 'dev', 'evt-smoke-ord_8sny02vi', 'ord_8sny02vi', '2026-06-17 16:36:32', '{\"orderId\": \"ord_8sny02vi\", \"provider\": \"dev\", \"paidAmountCents\": 500, \"providerEventId\": \"evt-smoke-ord_8sny02vi\"}');

DROP TABLE IF EXISTS `plans`;
CREATE TABLE `plans` (
  `id` varchar(128) NOT NULL,
  `name` varchar(191) NOT NULL,
  `credits` int(11) NOT NULL,
  `price_cents` int(11) NOT NULL,
  `currency` varchar(8) NOT NULL default 'USD',
  `enabled` tinyint(1) NOT NULL default '1',
  `created_at` datetime NOT NULL default '1970-01-01 00:00:00',
  `updated_at` datetime NOT NULL,
  PRIMARY KEY  (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

INSERT INTO `plans` (`id`, `name`, `credits`, `price_cents`, `currency`, `enabled`, `created_at`, `updated_at`) VALUES
('dev-small', 'Small', 100, 500, 'CNY', 1, '2026-06-17 16:31:36', '2026-06-18 10:20:41'),
('dev-medium', 'Medium', 500, 2000, 'CNY', 1, '2026-06-17 16:31:36', '2026-06-18 10:20:41'),
('dev-free', 'Free Trial', 20, 0, 'CNY', 1, '2026-06-17 16:31:36', '2026-06-18 10:20:41');

DROP TABLE IF EXISTS `platform_settings`;
CREATE TABLE `platform_settings` (
  `setting_key` varchar(191) NOT NULL,
  `setting_value` longtext,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY  (`setting_key`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

INSERT INTO `platform_settings` (`setting_key`, `setting_value`, `updated_at`) VALUES
('siteName', 'Image Idea', '2026-06-18 09:47:12'),
('publicBaseUrl', '', '2026-06-18 09:47:12'),
('supportEmail', '', '2026-06-18 09:47:12'),
('openaiBaseUrl', 'https://nexapi.tech/v1', '2026-06-18 09:47:12'),
('openaiImageModel', 'gpt-image-2', '2026-06-18 09:47:12'),
('epayGatewayUrl', 'https://zpayz.cn', '2026-06-18 09:47:12'),
('epayPid', '2026060115160017', '2026-06-18 09:47:12'),
('epayReturnUrl', '', '2026-06-18 09:47:12'),
('epayNotifyUrl', '', '2026-06-18 09:47:12'),
('openaiApiKey', 'sk-ECkioT1fWEJuhPrzyf59Y6CggdmY3yQuVN4lYVfrM4wWgNoN', '2026-06-18 09:47:12'),
('upstreamTimeoutMs', '180000', '2026-06-18 09:47:12'),
('allowUserApiConfig', 'false', '2026-06-18 09:47:12'),
('epayEnabled', 'true', '2026-06-18 09:47:12'),
('creditsPerImage', '1', '2026-06-18 09:47:12'),
('epayKey', 'TFn5tPUIZQseE5F9LPYY9uVeqaGlFoQc', '2026-06-18 07:59:06');

DROP TABLE IF EXISTS `user_accounts`;
CREATE TABLE `user_accounts` (
  `id` varchar(128) NOT NULL,
  `username` varchar(191) default NULL,
  `email` varchar(191) default NULL,
  `password_hash` varchar(255) default NULL,
  `display_name` varchar(191) default NULL,
  `avatar_url` longtext,
  `phone` varchar(32) default NULL,
  `admin_note` text,
  `role` varchar(32) NOT NULL default 'user',
  `status` varchar(32) NOT NULL default 'active',
  `last_login_at` datetime default NULL,
  `created_at` datetime NOT NULL default '1970-01-01 00:00:00',
  `updated_at` datetime NOT NULL,
  PRIMARY KEY  (`id`),
  UNIQUE KEY `user_accounts_email_key` (`email`),
  UNIQUE KEY `user_accounts_username_key` (`username`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

INSERT INTO `user_accounts` (`id`, `username`, `email`, `password_hash`, `display_name`, `avatar_url`, `phone`, `admin_note`, `role`, `status`, `last_login_at`, `created_at`, `updated_at`) VALUES
('1001', 'smoke+1781714161227', 'smoke+1781714161227@example.com', 'scrypt:hdN4hsFvEThPOoayGxflrw:JpIE-kK2ezE1jetyKthKRkCqES2EBhhqiTBTMLl7sBtq5PsUNoEq6vWkpclSlrPXVO3V4IrySpDOWJQmfFW6Nw', 'smoke+1781714161227', NULL, NULL, NULL, 'user', 'active', '2026-06-17 16:36:01', '2026-06-17 16:36:01', '2026-06-18 07:19:46'),
('1002', 'smoke+1781714192339', 'smoke+1781714192339@example.com', 'scrypt:O89P3qgMSt-tB00pd-iMpQ:opdzk0VfK0Xe9bN5Di4QXxkJLl6umMbM9Tg6q9Wl_4NK8__Y8ecsRsGI3hrqLHS8XvP1FFjySAaxqrsTFopW3g', 'smoke+1781714192339', NULL, NULL, NULL, 'user', 'active', '2026-06-17 16:36:32', '2026-06-17 16:36:32', '2026-06-18 07:19:46'),
('1003', 'codex-commercial-test', 'codex-commercial-test@example.com', 'scrypt:AEKniigbcAYjRPPdoKcLVg:ZI0UDrQcTBHu4Of29WWjSmetzQkZ1E6oyJ1XX_7aHzfbbVzm51t189-K2JhNXSi3eojwb3FzvFsT6zR6MnVXXg', 'codex-commercial-test', NULL, NULL, NULL, 'user', 'active', '2026-06-17 22:51:38', '2026-06-17 22:51:38', '2026-06-18 07:19:46'),
('1004', 'admin', 'admin@admin.com', 'scrypt:Rcec3BBSka01BR02F4zF1w:yWOMl4jNboi1D9323qrJ-PPkT4b-8ylh2tg7lJxvBRGVKRy3xLxmy2FHrSioGRbB9dn2RUUj1VRj61LqyLQeZQ', '测试', 'data:image/png;base64,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', NULL, NULL, 'admin', 'active', '2026-06-18 10:16:24', '2026-06-17 23:27:14', '2026-06-18 10:16:24'),
('1005', 'real-login-test+20260618120614', 'real-login-test+20260618120614@example.com', 'scrypt:2kAUWO4fttGa84xhq1nIeg:pOmVj_qdm92bF7cJICXWf8-3_wZd0KbuJbUC10Bt8kYKMSRmcuv40yqL_BZwJUIi0zXAzZ0-tH9FOH64wOPdrw', 'real-login-test+20260618120614', NULL, NULL, NULL, 'user', 'active', '2026-06-18 04:06:17', '2026-06-18 04:06:15', '2026-06-18 07:19:46'),
('1006', 'profile-route-test+20260618135433', 'profile-route-test+20260618135433@example.com', 'scrypt:Lf-7pGnE-xf_XWWiYNeeSg:DYOJp7Gg4bEtZlJPFX17AbhcA8LOEy7igN551qmXlMrlpjQFquMzk286Uyo1eHoGUS_5rEk6KZ1lSm7wkIoojQ', '??????', 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==', NULL, NULL, 'user', 'active', NULL, '2026-06-18 05:54:35', '2026-06-18 07:19:46'),
('1007', 'utf8-profile-1781762112515', 'utf8-profile-1781762112515@example.com', 'scrypt:In9OXiqqA2_zQ0ywlExBRA:d10hINyz3bo1PFBcYGteFmbg1WQL3Cge-2BqbLc_2X6GjzlREhvxaK84HxrpzuW3XBiq7_lpkmnhYWt1CfzLlw', '??????', NULL, NULL, NULL, 'user', 'active', NULL, '2026-06-18 05:55:13', '2026-06-18 07:19:46'),
('1008', 'utf8-escape-1781762135275', 'utf8-escape-1781762135275@example.com', 'scrypt:Mz8tBvGnj76Y1IW5c6Xwjg:QOKgRBTXe9esHyaA_mDG19Q9QIXWcFeR5N-y_qD9M0mUJ979sSlWJh9m103sxSdTOsZTXD2Ej70djWED_YJVpg', '运营测试用户', NULL, NULL, NULL, 'user', 'active', NULL, '2026-06-18 05:55:36', '2026-06-18 07:19:46'),
('1009', 'admin-smoke+20260618142023', 'admin-smoke+20260618142023@example.com', 'scrypt:2h2USyJagPCbh1JTsHZTKQ:zJO9bWjmwdTx7FNz-msyPWA8LOGlEFGrSWTPhox2xnZmmSqQfQaFVs1q2hez-pP1yzbeXI8W4jLwl8F4k-dCzA', 'admin-smoke+20260618142023', NULL, NULL, NULL, 'admin', 'active', '2026-06-18 06:20:25', '2026-06-18 06:20:24', '2026-06-18 07:19:46');

DROP TABLE IF EXISTS `user_plan_packages`;
CREATE TABLE `user_plan_packages` (
  `id` varchar(128) NOT NULL,
  `user_id` varchar(128) NOT NULL,
  `plan_id` varchar(128) NOT NULL,
  `order_id` varchar(128) NOT NULL,
  `total_uses` int(11) NOT NULL,
  `remaining_uses` int(11) NOT NULL,
  `status` varchar(32) NOT NULL default 'active',
  `expires_at` datetime default NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY  (`id`),
  UNIQUE KEY `uniq_order_id` (`order_id`),
  KEY `idx_user_status` (`user_id`,`status`,`created_at`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

SET FOREIGN_KEY_CHECKS=1;

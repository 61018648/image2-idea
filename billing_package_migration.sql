CREATE TABLE IF NOT EXISTS user_plan_packages (
  id varchar(128) NOT NULL,
  user_id varchar(128) NOT NULL,
  plan_id varchar(128) NOT NULL,
  order_id varchar(128) NOT NULL,
  total_uses int NOT NULL,
  remaining_uses int NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'active',
  expires_at datetime NULL,
  created_at datetime NOT NULL,
  updated_at datetime NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_order_id (order_id),
  KEY idx_user_status (user_id, status, created_at)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

-- Existing plans.credits and orders.credits are now interpreted as included generation uses.

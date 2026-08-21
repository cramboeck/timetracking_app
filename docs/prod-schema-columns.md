# Produktions-Schema: Tabellen und Spalten (Stand 21.08.2026)

> Export aus der Live-DB (`information_schema.columns`). Referenz für den
> Schema-Sweep — die WAHRHEIT bei Abweichungen von database.ts, denn die
> Prod-DB ist über alte Code-Versionen hinausgewachsen (z.B. wurden
> ticket_activities/kb_* nie in database.ts angelegt, existieren aber).
> Format: `tabelle: spalte1, spalte2, …`

```
absence_requests: id, user_id, organization_id, category, start_date, end_date, note, status, decided_by, decided_at, decision_note, created_at, updated_at
activities: id, user_id, name, description, is_billable, pricing_type, flat_rate, created_at, organization_id, updated_at, deleted_at
ai_config: id, user_id, provider, api_key, model, enabled, max_tokens, temperature, created_at, updated_at, system_prompt, prompt_templates, organization_id
audit_logs: id, user_id, action, details, ip_address, user_agent, timestamp, organization_id
canned_responses: id, user_id, title, content, shortcut, category, is_shared, usage_count, created_at, updated_at, organization_id
churn_risk_warnings: id, customer_id, organization_id, health_score, churn_risk, risk_factors, generated_at, acknowledged, acknowledged_at, acknowledged_by
clockodo_config: id, user_id, api_email, api_key, last_sync_at, created_at, updated_at, organization_id
company_info: id, user_id, name, address, city, zip_code, country, email, phone, website, tax_id, logo, customer_number, organization_id
contract_activity_log: id, contract_id, user_id, action, details, created_at, organization_id
contract_hourly_tracking: id, contract_id, year, month, included_hours, used_hours, overage_hours, rollover_hours, overage_amount, notes, created_at, updated_at
contract_positions: id, contract_id, position_number, name, description, quantity, unit, unit_price, total_price, position_type, is_recurring, billing_cycle, sort_order, created_at, updated_at
contracts: id, user_id, customer_id, contract_number, name, description, contract_type, status, start_date, end_date, is_indefinite, notice_period_days, auto_renew, renewal_period_months, billing_cycle, base_price, currency, included_hours_monthly, hourly_rate, overage_rate, sla_response_hours, sla_resolution_hours, support_hours, document_url, internal_notes, project_id, created_by, created_at, updated_at, deleted_at, organization_id
crm_interactions: id, organization_id, customer_id, user_id, type, direction, subject, content, summary, occurred_at, external_id, external_source, created_at, updated_at
customer_aliases: id, organization_id, customer_id, alias, source, created_at
customer_contacts: id, organization_id, customer_id, first_name, last_name, email, phone, mobile, job_title, department, role, is_primary, portal_user_id, preferred_contact_method, notify_on_ticket_update, notify_on_maintenance, linkedin_url, notes, avatar_url, created_at, updated_at, can_view_devices, can_view_invoices, can_view_quotes, mfa_enabled, mfa_secret, mfa_recovery_codes, notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply, push_enabled, push_on_ticket_reply, push_on_status_change, password_hash, password_reset_token, password_reset_expires, last_login, can_create_tickets, can_view_all_tickets
customer_email_domains: id, customer_id, organization_id, domain, is_primary, notes, created_at, created_by
customer_interactions: id, organization_id, customer_id, contact_id, user_id, type, direction, subject, content, summary, ticket_id, lead_id, contract_id, duration_minutes, scheduled_at, occurred_at, follow_up_required, follow_up_date, follow_up_assigned_to, follow_up_notes, follow_up_completed, outcome, tags, created_at, external_id, external_source
customer_metrics: id, customer_id, organization_id, period_type, period_start, period_end, revenue, hours_billed, hours_unbilled, tickets_opened, tickets_resolved, tickets_escalated, avg_resolution_time_hours, avg_first_response_time_hours, sla_breaches, interactions_count, last_interaction_date, active_contracts, contract_value, health_score, health_trend, churn_risk, risk_factors, created_at, updated_at
customer_portal_activity_log: id, portal_user_id, owner_user_id, action, resource_type, resource_id, details, ip_address, created_at
customer_portal_roles: id, owner_user_id, name, description, permissions, is_system_role, created_at, updated_at, organization_id
customer_portal_sessions: id, portal_user_id, token, ip_address, user_agent, expires_at, created_at
customer_portal_user_devices: id, portal_user_id, device_id, assigned_at, assigned_by
customer_portal_user_roles: id, portal_user_id, role_id, assigned_at, assigned_by
customer_portal_users: id, owner_user_id, customer_id, email, password_hash, name, phone, position, is_primary_contact, is_active, last_login, password_reset_token, password_reset_expires, created_at, updated_at, organization_id, can_create_tickets, can_view_all_tickets, can_view_devices, can_view_invoices, can_view_quotes, notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply, mfa_enabled, mfa_secret, can_view_time_report, can_view_contract, can_view_licenses, reset_token, reset_token_expires_at
customers: id, user_id, name, color, customer_number, contact_person, email, address, report_title, created_at, sevdesk_customer_id, hourly_rate, ninjarmm_organization_id, organization_id, time_rounding_interval, payment_terms_days, display_name, import_aliases, is_vendor, vendor_domain, vendor_notes, vendor_api_config, customer_type, default_project_id, sla_policy_id, updated_at, deleted_at, sevdesk_position_template, default_contract_id, primary_domain, distributor_identifiers
email_logs: id, organization_id, user_id, email_type, subject, recipient_email, recipient_name, sender_email, provider, provider_message_id, status, error_message, error_code, processing_time_ms, metadata, created_at, sent_at
email_notifications: id, user_id, notification_type, sent_at, status, error_message, recipient_email, subject, provider, organization_id
feature_packages: id, user_id, package_name, enabled, enabled_at, expires_at, created_at, organization_id
health_score_job_runs: id, started_at, completed_at, duration_ms, success, customers_processed, customers_updated, customers_skipped, warnings_generated, errors, created_at
infinigate_config: id, user_id, client_id, client_secret, api_key, environment, auto_sync, last_sync_at, created_at, updated_at
invoice_documents: id, organization_id, processed_invoice_id, filename, original_filename, mime_type, size, storage_path, created_at
invoice_exports: id, user_id, customer_id, sevdesk_invoice_id, sevdesk_invoice_number, period_start, period_end, total_hours, total_amount, status, created_at, updated_at, organization_id
invoice_line_items: id, organization_id, processed_invoice_id, position_number, description, article_number, quantity, unit, unit_price, total_price, vat_rate, period_start, period_end, period_text, product_type, product_sku, extracted_customer_name, extracted_customer_domain, extracted_customer_number, customer_id, match_confidence, match_method, rebilling_status, rebilling_invoice_id, rebilling_markup_percent, rebilling_notes, created_at, updated_at, reviewed_by, reviewed_at, contract_id, license_id, serial_number, item_type
kb_articles: id, user_id, category_id, title, slug, content, excerpt, is_published, is_featured, view_count, helpful_yes, helpful_no, created_at, updated_at, published_at
kb_categories: id, user_id, name, description, icon, sort_order, is_public, created_at, updated_at
lead_activities: id, lead_id, user_id, activity_type, title, description, scheduled_at, completed_at, is_completed, outcome, duration_minutes, created_at, updated_at, organization_id
leads: id, organization_id, customer_id, name, company, email, phone, website, status, source, priority, estimated_value, probability, assigned_to, created_by, expected_close_date, last_contact_date, next_follow_up, description, notes, tags, custom_fields, created_at, updated_at, converted_at, lost_reason
maintenance_activity_log: id, announcement_id, action, actor_type, actor_id, actor_name, details, created_at
maintenance_announcement_customers: id, announcement_id, customer_id, approval_token, status, approved_by, approved_at, rejection_reason, notification_sent_at, reminder_sent_at, created_at
maintenance_announcement_devices: id, announcement_id, device_id, status, started_at, completed_at, notes, created_at
maintenance_announcements: id, user_id, title, description, maintenance_type, affected_systems, scheduled_start, scheduled_end, status, require_approval, approval_deadline, auto_proceed_on_no_response, notes, created_at, updated_at, ticket_id, organization_id
maintenance_templates: id, user_id, name, title, description, maintenance_type, affected_systems, estimated_duration_minutes, require_approval, auto_proceed_on_no_response, is_active, created_at, updated_at, organization_id
microsoft365_config: id, organization_id, tenant_id, client_id, client_secret, mail_from, support_mailbox, is_configured, last_connection_test, last_connection_status, features_enabled, created_at, updated_at, invoice_mailbox
ninjarmm_alert_exclusions: id, user_id, name, description, match_type, match_field, match_value, is_active, hit_count, last_hit_at, created_at, updated_at, organization_id
ninjarmm_alerts: id, user_id, ninja_alert_id, ninja_device_id, device_id, severity, priority, message, source_type, created_at_ninja, ticket_id, status, synced_at, resolved, resolved_at, ninja_uid, activity_time, created_at, source_name, alert_data, organization_id
ninjarmm_config: id, user_id, client_id, client_secret, instance_url, access_token, refresh_token, token_expires_at, auto_sync_devices, sync_interval_minutes, last_sync_at, created_at, updated_at, organization_id, webhook_secret, webhook_enabled, webhook_auto_create_tickets, webhook_min_severity, webhook_auto_resolve_tickets
ninjarmm_device_ip_history: id, device_id, ip_type, old_ip, new_ip, changed_at
ninjarmm_device_os_patches: id, device_id, patch_type, kb_number, name, description, severity, category, install_date, installed_on, size_bytes, status, ninja_patch_id, created_at
ninjarmm_device_software: id, device_id, name, publisher, version, install_date, size_bytes, ninja_software_id, created_at
ninjarmm_devices: id, user_id, ninja_device_id, ninja_org_id, organization_id, system_name, dns_name, device_type, os_name, os_version, last_contact, last_logged_in_user, public_ip, private_ip, offline, approval_status, notes, custom_fields, last_sync_at, created_at, ninja_id, display_name, node_class, manufacturer, model, serial_number, synced_at, device_data, org_id, critical_vuln_count, high_vuln_count, medium_vuln_count, low_vuln_count, health_status, health_synced_at
ninjarmm_organizations: id, user_id, ninja_org_id, name, description, customer_id, device_count, last_sync_at, created_at, ninja_id, synced_at, userdata, organization_id
ninjarmm_vulnerabilities: id, user_id, organization_id, device_id, cve_id, cve_description, cve_published_date, severity, cvss_score, cvss_vector, software_name, software_vendor, software_version, status, first_seen_at, last_seen_at, patched_at, ignored_at, ignored_reason, ninja_vulnerability_id, ticket_id, created_at, updated_at
ninjarmm_webhook_events: id, user_id, event_type, ninja_alert_id, ninja_device_id, severity, status, payload, error_message, alert_id, ticket_id, processing_time_ms, created_at, message, device_name, organization_id
notification_preferences: id, user_id, organization_id, push_enabled, push_on_new_ticket, push_on_ticket_assigned, push_on_ticket_comment, push_on_status_change, push_on_sla_warning, push_on_mention, email_enabled, email_on_ticket_assigned, email_on_ticket_comment, email_on_status_change, email_on_sla_warning, email_on_mention, email_daily_digest, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, created_at, updated_at
notification_settings: id, user_id, weekly_summary_enabled, weekly_summary_day, missing_entries_enabled, missing_entries_threshold, created_at, updated_at, organization_id
opportunities: id, organization_id, customer_id, lead_id, contact_id, name, description, stage_id, value, currency, probability, weighted_value, expected_close_date, actual_close_date, assigned_to, created_by, status, lost_reason, lost_to_competitor, source, campaign, next_step, next_step_date, notes, tags, created_at, updated_at
opportunity_activities: id, opportunity_id, user_id, activity_type, title, description, old_stage_id, new_stage_id, old_value, new_value, scheduled_at, completed_at, is_completed, created_at
organization_invitations: id, organization_id, email, role, invitation_code, invited_by, expires_at, accepted_at, accepted_by, created_at
organization_members: id, organization_id, user_id, role, invited_by, joined_at
organizations: id, name, slug, owner_user_id, settings, logo, created_at, updated_at
password_reset_tokens: id, user_id, token, expires_at, used, created_at, organization_id
pipeline_stages: id, organization_id, name, description, color, probability, sort_order, is_won, is_lost, created_at
portal_push_subscriptions: id, contact_id, endpoint, p256dh, auth, device_name, created_at, last_used_at
portal_settings: id, user_id, company_name, welcome_message, logo_url, primary_color, show_knowledge_base, require_login_for_kb, created_at, updated_at, teamviewer_link
portal_trusted_devices: id, contact_id, device_token, device_name, browser, os, ip_address, created_at, last_used_at, expires_at
processed_invoices: id, organization_id, email_id, email_subject, sender_email, sender_name, received_at, attachment_count, document_ids, vendor_id, status, error_message, processed_at, sevdesk_voucher_id, full_text, search_vector, source, original_filename, sevdesk_voucher_number, invoice_number, supplier_name, supplier_address, supplier_tax_id, invoice_date, due_date, net_amount, gross_amount, vat_amount, vat_rate, currency, iban, bic, payment_method, customer_number, extracted_at, extraction_confidence, infinigate_document_guid
projects: id, user_id, customer_id, name, is_active, rate_type, hourly_rate, created_at, organization_id, updated_at, deleted_at
push_subscriptions: id, user_id, organization_id, endpoint, p256dh, auth, device_name, created_at, last_used_at, subscription_type, contact_id
refresh_tokens: id, user_id, token_hash, device_info, created_at, expires_at, revoked_at, rotated_to_hash
report_approvals: id, user_id, token, recipient_email, recipient_name, report_data, status, comment, sent_at, reviewed_at, expires_at, created_at, organization_id, reminder_sent_at
security_alerts: id, alert_type, ip_address, username, details, created_at
sevdesk_config: id, user_id, api_token, default_hourly_rate, payment_terms_days, tax_rate, auto_sync_customers, create_as_final, last_sync_at, created_at, updated_at, organization_id
sevdesk_documents: id, user_id, sevdesk_id, document_type, document_number, contact_id, contact_name, document_date, status, status_name, header, head_text, foot_text, sum_net, sum_gross, sum_tax, currency, positions_json, full_text, search_vector, synced_at, created_at
sla_policies: id, user_id, name, description, priority, first_response_minutes, resolution_minutes, business_hours_only, is_active, is_default, created_at, updated_at, organization_id
social_media_accounts: id, user_id, organization_id, platform, account_name, account_id, access_token, refresh_token, token_expires_at, is_active, created_at, updated_at
social_media_autopilot_settings: id, organization_id, enabled, posts_per_week, content_themes, target_audience, brand_voice, approval_mode, platforms, content_mix, last_generated, created_at, updated_at
social_media_competitors: id, organization_id, name, profiles, notes, last_analyzed, analysis_data, created_at
social_media_content_categories: id, organization_id, name, color, target_percentage, description, created_at
social_media_engagement_history: id, organization_id, platform, post_url, author_name, original_content, response_content, response_type, created_at
social_media_engagement_settings: id, organization_id, enabled, platforms, target_keywords, target_accounts, response_style, daily_limit, exclude_keywords, created_at, updated_at
social_media_generated_images: id, organization_id, user_id, prompt, revised_prompt, provider, model, image_url, image_data, aspect_ratio, style, size, cost_cents, used_in_story_id, used_in_post_id, created_at
social_media_hashtag_groups: id, user_id, organization_id, name, hashtags, category, created_at, updated_at
social_media_image_settings: id, organization_id, provider, api_key_encrypted, default_style, default_aspect_ratio, quality, credits_used, credits_limit, created_at, updated_at
social_media_post_platforms: id, post_id, account_id, platform_post_id, platform_content, status, error_message, published_at, engagement_likes, engagement_comments, engagement_shares, created_at, updated_at
social_media_posts: id, user_id, organization_id, customer_id, title, content, media_urls, hashtags, status, scheduled_at, published_at, ai_generated, ai_prompt, created_at, updated_at, content_category, evergreen, recycle_count, last_recycled_at
social_media_queue_settings: id, organization_id, enabled, posts_per_day, preferred_times, weekend_posting, content_mix, created_at, updated_at
social_media_stories: id, organization_id, user_id, title, content_type, media_urls, text_overlays, background_color, background_gradient, music_suggestion, stickers, link_url, link_text, poll_question, poll_options, scheduled_at, platforms, status, duration_seconds, ai_generated, ai_prompt, template_id, engagement_data, expires_at, published_at, created_at, updated_at
social_media_story_templates: id, organization_id, user_id, name, description, category, content_type, layout, text_styles, color_scheme, is_system, preview_url, usage_count, created_at
social_media_templates: id, user_id, organization_id, name, content, platform, category, hashtags, is_active, created_at, updated_at
task_activity_log: id, task_id, user_id, action, old_value, new_value, details, created_at, organization_id
task_checklist_items: id, task_id, title, completed, sort_order, completed_at, created_at, updated_at, organization_id
task_comments: id, task_id, user_id, comment, created_at, updated_at, organization_id
task_templates: id, organization_id, name, title, description, priority, estimated_minutes, category, tags, checklist_items, is_active, created_by, created_at, updated_at
tasks: id, organization_id, title, description, status, priority, ticket_id, project_id, customer_id, assigned_to, created_by, due_date, due_time, reminder_at, estimated_minutes, is_recurring, recurrence_pattern, recurrence_interval, recurrence_days, recurrence_end_date, parent_task_id, category, tags, color, completed_at, completed_by, sort_order, created_at, updated_at
team_invitations: id, team_id, invitation_code, role, created_by, expires_at, used_by, used_at, created_at
team_members: team_id, user_id, role, joined_at
teams: id, name, owner_id, created_at, updated_at, organization_id
ticket_activities: id, ticket_id, user_id, customer_contact_id, action_type, old_value, new_value, metadata, created_at
ticket_ai_suggestions: id, ticket_id, user_id, suggestion_type, content, confidence, context_used, model_used, tokens_used, is_helpful, applied, created_at, organization_id
ticket_attachments: id, ticket_id, comment_id, filename, file_url, file_size, mime_type, uploaded_by_user_id, uploaded_by_contact_id, created_at
ticket_comments: id, ticket_id, user_id, customer_contact_id, is_internal, content, created_at, portal_user_id, updated_at, organization_id
ticket_email_attachments: id, ticket_email_id, attachment_id, name, content_type, size, stored_locally, local_path, created_at
ticket_emails: id, ticket_id, organization_id, message_id, conversation_id, internet_message_id, direction, subject, body_preview, body_html, body_text, from_name, from_email, to_recipients, cc_recipients, is_read, importance, has_attachments, received_at, sent_at, created_at, updated_at
ticket_sequences: organization_id, last_number
ticket_tag_assignments: ticket_id, tag_id, assigned_at
ticket_tags: id, user_id, name, color, created_at, organization_id
ticket_tasks: id, ticket_id, title, completed, sort_order, visible_to_customer, created_at, completed_at, assigned_to, due_date, description, updated_at
ticket_templates: id, organization_id, name, title_template, description_template, default_priority, default_customer_id, default_project_id, category, is_active, usage_count, created_at, updated_at
tickets: id, ticket_number, user_id, customer_id, project_id, created_by_contact_id, title, description, status, priority, assigned_to_user_id, created_at, updated_at, resolved_at, closed_at, satisfaction_rating, satisfaction_feedback, sla_policy_id, first_response_due_at, resolution_due_at, first_response_at, sla_first_response_breached, sla_resolution_breached, merged_into_id, device_id, portal_user_id, source, ninja_alert_id, solution, resolution_type, organization_id, category, email_conversation_id, email_from, email_subject, assigned_to, sla_response_due, sla_resolution_due, sla_response_breached, due_date
time_entries: id, user_id, project_id, activity_id, start_time, end_time, duration, description, is_running, created_at, ticket_id, invoice_export_id, organization_id, task_id, contract_id, is_billable, external_id, external_source, updated_at, entry_scope, internal_category, customer_visibility
time_entry_changes: id, organization_id, entry_id, user_id, action, entry_date, before_data, after_data, created_at
trusted_devices: id, user_id, device_token, device_name, browser, os, ip_address, created_at, last_used_at, expires_at, organization_id
users: id, display_name, email, password_hash, account_type, organization_name, team_id, team_role, role, mfa_enabled, mfa_secret, accent_color, gray_tone, time_rounding_interval, created_at, last_login, time_format, customer_number, username, has_ticket_access, feature_flags, mfa_recovery_codes, dark_mode, preferences, heartbeat_interval_minutes, weekly_hours
work_sessions: id, user_id, organization_id, work_date, started_at, ended_at, break_seconds, break_started_at, note, created_at, updated_at
```

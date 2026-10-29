export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      activity: {
        Row: {
          actor_id: number | null;
          aktor_assignee: boolean | null;
          at: string;
          at_awal: string | null;
          catatan: string | null;
          dari: Json | null;
          dicatat_pada: string;
          id: number;
          jenis: string;
          ke: Json | null;
          lengkap: boolean;
          snapshot: Json | null;
          sumber: string;
          task_id: string | null;
          token_id: string | null;
        };
        Insert: {
          actor_id?: number | null;
          aktor_assignee?: boolean | null;
          at?: string;
          at_awal?: string | null;
          catatan?: string | null;
          dari?: Json | null;
          dicatat_pada?: string;
          id?: never;
          jenis: string;
          ke?: Json | null;
          lengkap?: boolean;
          snapshot?: Json | null;
          sumber: string;
          task_id?: string | null;
          token_id?: string | null;
        };
        Update: {
          actor_id?: number | null;
          aktor_assignee?: boolean | null;
          at?: string;
          at_awal?: string | null;
          catatan?: string | null;
          dari?: Json | null;
          dicatat_pada?: string;
          id?: never;
          jenis?: string;
          ke?: Json | null;
          lengkap?: boolean;
          snapshot?: Json | null;
          sumber?: string;
          task_id?: string | null;
          token_id?: string | null;
        };
        Relationships: [];
      };
      api_tokens: {
        Row: {
          created_at: string;
          created_by: number | null;
          id: string;
          last_used_at: string | null;
          member_id: number;
          nama: string;
          prefix: string;
          revoked_at: string | null;
          scope: string;
          token_hash: string;
        };
        Insert: {
          created_at?: string;
          created_by?: number | null;
          id?: string;
          last_used_at?: string | null;
          member_id: number;
          nama: string;
          prefix: string;
          revoked_at?: string | null;
          scope: string;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          created_by?: number | null;
          id?: string;
          last_used_at?: string | null;
          member_id?: number;
          nama?: string;
          prefix?: string;
          revoked_at?: string | null;
          scope?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_tokens_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "api_tokens_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          value: NonNullable<Json>;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      attachments: {
        Row: {
          clickup_id: string | null;
          clickup_url: string | null;
          comment_id: string | null;
          created_at: string;
          deleted_at: string | null;
          deleted_by: number | null;
          extension: string | null;
          id: string;
          mimetype: string | null;
          size: number | null;
          status_salin: string;
          storage_path: string | null;
          sumber: string;
          synced_at: string | null;
          task_id: string;
          title: string;
          uploaded_by: number | null;
          j_lampiran: Json | null;
        };
        Insert: {
          clickup_id?: string | null;
          clickup_url?: string | null;
          comment_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: number | null;
          extension?: string | null;
          id?: string;
          mimetype?: string | null;
          size?: number | null;
          status_salin?: string;
          storage_path?: string | null;
          sumber?: string;
          synced_at?: string | null;
          task_id: string;
          title?: string;
          uploaded_by?: number | null;
        };
        Update: {
          clickup_id?: string | null;
          clickup_url?: string | null;
          comment_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: number | null;
          extension?: string | null;
          id?: string;
          mimetype?: string | null;
          size?: number | null;
          status_salin?: string;
          storage_path?: string | null;
          sumber?: string;
          synced_at?: string | null;
          task_id?: string;
          title?: string;
          uploaded_by?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "attachments_comment_fk";
            columns: ["comment_id", "task_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id", "task_id"];
          },
          {
            foreignKeyName: "attachments_deleted_by_fkey";
            columns: ["deleted_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      comment_mentions: {
        Row: {
          comment_id: string;
          member_id: number;
        };
        Insert: {
          comment_id: string;
          member_id: number;
        };
        Update: {
          comment_id?: string;
          member_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "comment_mentions_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_mentions_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          author_id: number | null;
          body_json: Json | null;
          clickup_hash: string | null;
          clickup_id: string | null;
          created_at: string;
          deleted_at: string | null;
          deleted_by: number | null;
          edited_at: string | null;
          extra: NonNullable<Json>;
          id: string;
          parent_id: string | null;
          sumber: string;
          synced_at: string | null;
          task_id: string;
          text: string;
        };
        Insert: {
          author_id?: number | null;
          body_json?: Json | null;
          clickup_hash?: string | null;
          clickup_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: number | null;
          edited_at?: string | null;
          extra?: NonNullable<Json>;
          id?: string;
          parent_id?: string | null;
          sumber?: string;
          synced_at?: string | null;
          task_id: string;
          text?: string;
        };
        Update: {
          author_id?: number | null;
          body_json?: Json | null;
          clickup_hash?: string | null;
          clickup_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: number | null;
          edited_at?: string | null;
          extra?: NonNullable<Json>;
          id?: string;
          parent_id?: string | null;
          sumber?: string;
          synced_at?: string | null;
          task_id?: string;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_deleted_by_fkey";
            columns: ["deleted_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_parent_fk";
            columns: ["parent_id", "task_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id", "task_id"];
          },
          {
            foreignKeyName: "comments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      folders: {
        Row: {
          archived: boolean;
          created_at: string;
          hidden: boolean;
          id: string;
          name: string;
          orderindex: number | null;
          space_id: string;
          sumber: string;
          synced_at: string | null;
        };
        Insert: {
          archived?: boolean;
          created_at?: string;
          hidden?: boolean;
          id?: string;
          name: string;
          orderindex?: number | null;
          space_id: string;
          sumber?: string;
          synced_at?: string | null;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          hidden?: boolean;
          id?: string;
          name?: string;
          orderindex?: number | null;
          space_id?: string;
          sumber?: string;
          synced_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "folders_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      hari_libur: {
        Row: {
          nama: string;
          tanggal: string;
        };
        Insert: {
          nama: string;
          tanggal: string;
        };
        Update: {
          nama?: string;
          tanggal?: string;
        };
        Relationships: [];
      };
      idem: {
        Row: {
          created_at: string;
          hasil: Json | null;
          key: string;
        };
        Insert: {
          created_at?: string;
          hasil?: Json | null;
          key: string;
        };
        Update: {
          created_at?: string;
          hasil?: Json | null;
          key?: string;
        };
        Relationships: [];
      };
      list_statuses: {
        Row: {
          clickup_status_id: string | null;
          color: string | null;
          list_id: string;
          orderindex: number;
          status: string;
          type: string;
        };
        Insert: {
          clickup_status_id?: string | null;
          color?: string | null;
          list_id: string;
          orderindex?: number;
          status: string;
          type: string;
        };
        Update: {
          clickup_status_id?: string | null;
          color?: string | null;
          list_id?: string;
          orderindex?: number;
          status?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "list_statuses_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "lists";
            referencedColumns: ["id"];
          },
        ];
      };
      lists: {
        Row: {
          archived: boolean;
          content: string | null;
          created_at: string;
          folder_id: string | null;
          id: string;
          name: string;
          orderindex: number | null;
          space_id: string;
          sumber: string;
          synced_at: string | null;
          tidak_ditagih: boolean;
        };
        Insert: {
          archived?: boolean;
          content?: string | null;
          created_at?: string;
          folder_id?: string | null;
          id?: string;
          name: string;
          orderindex?: number | null;
          space_id: string;
          sumber?: string;
          synced_at?: string | null;
          tidak_ditagih?: boolean;
        };
        Update: {
          archived?: boolean;
          content?: string | null;
          created_at?: string;
          folder_id?: string | null;
          id?: string;
          name?: string;
          orderindex?: number | null;
          space_id?: string;
          sumber?: string;
          synced_at?: string | null;
          tidak_ditagih?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "lists_folder_fk";
            columns: ["folder_id", "space_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id", "space_id"];
          },
          {
            foreignKeyName: "lists_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      members: {
        Row: {
          aktif: boolean;
          auth_user_id: string | null;
          clickup_email: string | null;
          color: string | null;
          created_at: string;
          email: string | null;
          harus_ganti_password: boolean;
          id: number;
          initials: string | null;
          nama: string | null;
          role: string;
          updated_at: string;
          username: string;
        };
        Insert: {
          aktif?: boolean;
          auth_user_id?: string | null;
          clickup_email?: string | null;
          color?: string | null;
          created_at?: string;
          email?: string | null;
          harus_ganti_password?: boolean;
          id?: number;
          initials?: string | null;
          nama?: string | null;
          role?: string;
          updated_at?: string;
          username: string;
        };
        Update: {
          aktif?: boolean;
          auth_user_id?: string | null;
          clickup_email?: string | null;
          color?: string | null;
          created_at?: string;
          email?: string | null;
          harus_ganti_password?: boolean;
          id?: number;
          initials?: string | null;
          nama?: string | null;
          role?: string;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          actor_id: number | null;
          comment_id: string | null;
          created_at: string;
          id: number;
          jenis: string;
          member_id: number;
          read_at: string | null;
          sumber: string | null;
          task_id: string | null;
        };
        Insert: {
          actor_id?: number | null;
          comment_id?: string | null;
          created_at?: string;
          id?: never;
          jenis: string;
          member_id: number;
          read_at?: string | null;
          sumber?: string | null;
          task_id?: string | null;
        };
        Update: {
          actor_id?: number | null;
          comment_id?: string | null;
          created_at?: string;
          id?: never;
          jenis?: string;
          member_id?: number;
          read_at?: string | null;
          sumber?: string | null;
          task_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      space_anggota: {
        Row: {
          added_at: string;
          member_id: number;
          space_id: string;
          sumber: string;
        };
        Insert: {
          added_at?: string;
          member_id: number;
          space_id: string;
          sumber?: string;
        };
        Update: {
          added_at?: string;
          member_id?: number;
          space_id?: string;
          sumber?: string;
        };
        Relationships: [
          {
            foreignKeyName: "space_anggota_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "space_anggota_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      spaces: {
        Row: {
          archived: boolean;
          color: string | null;
          created_at: string;
          id: string;
          name: string;
          orderindex: number | null;
          private: boolean;
          sumber: string;
          synced_at: string | null;
        };
        Insert: {
          archived?: boolean;
          color?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          orderindex?: number | null;
          private?: boolean;
          sumber?: string;
          synced_at?: string | null;
        };
        Update: {
          archived?: boolean;
          color?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          orderindex?: number | null;
          private?: boolean;
          sumber?: string;
          synced_at?: string | null;
        };
        Relationships: [];
      };
      sync_raw: {
        Row: {
          entity: string;
          fetched_at: string;
          hash: string | null;
          id: string;
          payload: Json | null;
        };
        Insert: {
          entity: string;
          fetched_at?: string;
          hash?: string | null;
          id: string;
          payload?: Json | null;
        };
        Update: {
          entity?: string;
          fetched_at?: string;
          hash?: string | null;
          id?: string;
          payload?: Json | null;
        };
        Relationships: [];
      };
      sync_runs: {
        Row: {
          census: Json | null;
          counts: Json | null;
          diffs: Json | null;
          errors: Json | null;
          finished_at: string | null;
          id: number;
          mode: string;
          started_at: string;
        };
        Insert: {
          census?: Json | null;
          counts?: Json | null;
          diffs?: Json | null;
          errors?: Json | null;
          finished_at?: string | null;
          id?: never;
          mode: string;
          started_at?: string;
        };
        Update: {
          census?: Json | null;
          counts?: Json | null;
          diffs?: Json | null;
          errors?: Json | null;
          finished_at?: string | null;
          id?: never;
          mode?: string;
          started_at?: string;
        };
        Relationships: [];
      };
      task_assignees: {
        Row: {
          added_at: string;
          added_by: number | null;
          member_id: number;
          task_id: string;
        };
        Insert: {
          added_at?: string;
          added_by?: number | null;
          member_id: number;
          task_id: string;
        };
        Update: {
          added_at?: string;
          added_by?: number | null;
          member_id?: number;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_assignees_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignees_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignees_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          archived: boolean;
          archived_at: string | null;
          cari: unknown;
          clickup_hash: string | null;
          clickup_id: string | null;
          clickup_url: string | null;
          closed_at: string | null;
          comment_count: number;
          created_at: string;
          creator_id: number | null;
          deleted_at: string | null;
          deleted_by: number | null;
          desc_unreadable: boolean;
          description_plain: string | null;
          done_at: string | null;
          due_at: string | null;
          due_has_time: boolean;
          due_wib: string | null;
          extra: NonNullable<Json>;
          first_closed_at: string | null;
          id: string;
          kategori_id: string | null;
          last_comment_at: string | null;
          list_id: string;
          markdown: string | null;
          name: string;
          orderindex: number | null;
          parent_id: string | null;
          priority: number | null;
          reopen_count: number;
          start_at: string | null;
          start_has_time: boolean;
          status: string;
          status_type: string;
          sumber: string;
          synced_at: string | null;
          updated_at: string;
          versi: number;
          ringkas_tugas: Json | null;
        };
        Insert: {
          archived?: boolean;
          archived_at?: string | null;
          cari?: unknown;
          clickup_hash?: string | null;
          clickup_id?: string | null;
          clickup_url?: string | null;
          closed_at?: string | null;
          comment_count?: number;
          created_at?: string;
          creator_id?: number | null;
          deleted_at?: string | null;
          deleted_by?: number | null;
          desc_unreadable?: boolean;
          description_plain?: string | null;
          done_at?: string | null;
          due_at?: string | null;
          due_has_time?: boolean;
          due_wib?: string | null;
          extra?: NonNullable<Json>;
          first_closed_at?: string | null;
          id?: string;
          kategori_id?: string | null;
          last_comment_at?: string | null;
          list_id: string;
          markdown?: string | null;
          name: string;
          orderindex?: number | null;
          parent_id?: string | null;
          priority?: number | null;
          reopen_count?: number;
          start_at?: string | null;
          start_has_time?: boolean;
          status: string;
          status_type: string;
          sumber?: string;
          synced_at?: string | null;
          updated_at?: string;
          versi?: number;
        };
        Update: {
          archived?: boolean;
          archived_at?: string | null;
          cari?: unknown;
          clickup_hash?: string | null;
          clickup_id?: string | null;
          clickup_url?: string | null;
          closed_at?: string | null;
          comment_count?: number;
          created_at?: string;
          creator_id?: number | null;
          deleted_at?: string | null;
          deleted_by?: number | null;
          desc_unreadable?: boolean;
          description_plain?: string | null;
          done_at?: string | null;
          due_at?: string | null;
          due_has_time?: boolean;
          due_wib?: string | null;
          extra?: NonNullable<Json>;
          first_closed_at?: string | null;
          id?: string;
          kategori_id?: string | null;
          last_comment_at?: string | null;
          list_id?: string;
          markdown?: string | null;
          name?: string;
          orderindex?: number | null;
          parent_id?: string | null;
          priority?: number | null;
          reopen_count?: number;
          start_at?: string | null;
          start_has_time?: boolean;
          status?: string;
          status_type?: string;
          sumber?: string;
          synced_at?: string | null;
          updated_at?: string;
          versi?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_deleted_by_fkey";
            columns: ["deleted_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_status_fk";
            columns: ["list_id", "status"];
            isOneToOne: false;
            referencedRelation: "list_statuses";
            referencedColumns: ["list_id", "status"];
          },
        ];
      };
      workspace: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      akses_semua: { Args: { p_m: number }; Returns: boolean };
      aktor: { Args: Record<PropertyKey, never>; Returns: number };
      anggota_impor_wajib: { Args: { p_ids: number[] }; Returns: undefined };
      anggota_wajib: { Args: { p_ids: number[] }; Returns: undefined };
      api_comment_replies: {
        Args: { p_aktor: number; p_comment: string };
        Returns: Json;
      };
      api_create_comment: {
        Args: {
          p_aktor: number;
          p_body: Json;
          p_idem?: string;
          p_task: string;
        };
        Returns: Json;
      };
      api_create_reply: {
        Args: {
          p_aktor: number;
          p_body: Json;
          p_comment: string;
          p_idem?: string;
        };
        Returns: Json;
      };
      api_create_task: {
        Args: {
          p_aktor: number;
          p_body: Json;
          p_idem?: string;
          p_list: string;
        };
        Returns: Json;
      };
      api_delete_task: {
        Args: { p_aktor: number; p_task: string };
        Returns: Json;
      };
      api_folder_lists: {
        Args: { p_aktor: number; p_archived?: boolean; p_folder: string };
        Returns: Json;
      };
      api_list: { Args: { p_aktor: number; p_list: string }; Returns: Json };
      api_list_tasks: {
        Args: {
          p_aktor: number;
          p_archived?: boolean;
          p_date_updated_gt?: number;
          p_include_closed?: boolean;
          p_list: string;
          p_md?: boolean;
          p_page?: number;
          p_subtasks?: boolean;
        };
        Returns: Json;
      };
      api_move_task: {
        Args: { p_aktor: number; p_list: string; p_task: string };
        Returns: Json;
      };
      api_space_folders: {
        Args: { p_aktor: number; p_archived?: boolean; p_space: string };
        Returns: Json;
      };
      api_space_lists: {
        Args: { p_aktor: number; p_archived?: boolean; p_space: string };
        Returns: Json;
      };
      api_spaces: {
        Args: { p_aktor: number; p_archived?: boolean };
        Returns: Json;
      };
      api_task: {
        Args: { p_aktor: number; p_md?: boolean; p_task: string };
        Returns: Json;
      };
      api_task_comments: {
        Args: { p_aktor: number; p_task: string };
        Returns: Json;
      };
      api_team: { Args: { p_aktor: number }; Returns: Json };
      api_token_cek: { Args: { p_hash: string }; Returns: Json };
      api_update_task: {
        Args: { p_aktor: number; p_body: Json; p_task: string };
        Returns: Json;
      };
      api_user: { Args: { p_aktor: number }; Returns: Json };
      app_url: { Args: Record<PropertyKey, never>; Returns: string };
      beban: { Args: { p_member: number; p_tanggal: string }; Returns: number };
      body_web: { Args: { p_body: Json }; Returns: Json };
      boleh_ubah_clickup: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      boleh_unggah_lampiran: { Args: { p_name: string }; Returns: boolean };
      bool_dari: { Args: { p_default?: boolean; v: Json }; Returns: boolean };
      cari_tugas: {
        Args: {
          p_include_closed: boolean;
          p_limit: number;
          p_q: string;
          p_space: string;
        };
        Returns: {
          peringkat: number;
          task_id: string;
        }[];
      };
      catat_activity: {
        Args: {
          p_actor?: number;
          p_aktor_impor?: boolean;
          p_at?: string;
          p_at_awal?: string;
          p_catatan?: string;
          p_dari?: Json;
          p_jenis: string;
          p_ke?: Json;
          p_snapshot?: Json;
          p_task: string;
        };
        Returns: undefined;
      };
      hari_ini_wib: { Args: Record<PropertyKey, never>; Returns: string };
      hari_kerja: { Args: { a: string; b: string }; Returns: number };
      id_baru: { Args: { len: number; prefix: string }; Returns: string };
      idem_ambil: { Args: { p_kunci: string }; Returns: Json };
      idem_simpan: {
        Args: { p_hasil: Json; p_kunci: string };
        Returns: undefined;
      };
      ids_dari: { Args: { v: Json }; Returns: number[] };
      impor_batch: {
        Args: {
          p_aktor: number;
          p_at_awal?: string;
          p_jenis: string;
          p_mode?: string;
          p_rows: Json;
        };
        Returns: Json;
      };
      impor_run_mulai: {
        Args: { p_aktor: number; p_mode: string };
        Returns: Json;
      };
      impor_run_selesai: {
        Args: {
          p_aktor: number;
          p_census?: Json;
          p_counts?: Json;
          p_diffs?: Json;
          p_errors?: Json;
          p_id: number;
        };
        Returns: Json;
      };
      impor_tandai_hilang: {
        Args: {
          p_aktor: number;
          p_ids_ada: string[];
          p_jenis: string;
          p_lingkup?: Json;
          p_mode?: string;
        };
        Returns: Json;
      };
      inti_assignee: {
        Args: { p_add: number[]; p_rem: number[]; p_task: string };
        Returns: undefined;
      };
      inti_buat_tugas: {
        Args: { p_body: Json; p_list: string };
        Returns: string;
      };
      inti_hapus: { Args: { p_task: string }; Returns: undefined };
      inti_komentar: {
        Args: {
          p_mentions?: number[];
          p_parent: string;
          p_task: string;
          p_teks: string;
        };
        Returns: string;
      };
      inti_pindah: {
        Args: { p_list: string; p_task: string };
        Returns: undefined;
      };
      inti_ubah_tugas: {
        Args: { p_body: Json; p_task: string };
        Returns: undefined;
      };
      is_member: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_owner: { Args: Record<PropertyKey, never>; Returns: boolean };
      iso_utc: { Args: { t: string }; Returns: string };
      j_baris: { Args: { p_task: string }; Returns: Json };
      j_comment: { Args: { p_comment: string }; Returns: Json };
      j_folder_list: { Args: { p_list: string }; Returns: Json };
      j_komentar_web: { Args: { p_id: string }; Returns: Json };
      j_lampiran: {
        Args: { a: Database["public"]["Tables"]["attachments"]["Row"] };
        Returns: Json;
      };
      j_lampiran_web: { Args: { p_id: string }; Returns: Json };
      j_list: { Args: { p_list: string }; Returns: Json };
      j_list_statuses: { Args: { p_list: string }; Returns: Json };
      j_member: { Args: { p_id: number }; Returns: Json };
      j_prioritas: { Args: { p: number }; Returns: Json };
      j_task: {
        Args: { p_lampiran?: boolean; p_md?: boolean; p_task: string };
        Returns: Json;
      };
      jejak_tanggal: { Args: { ada_jam: boolean; t: string }; Returns: Json };
      kategori_due: {
        Args: {
          p_due: string;
          p_hari?: string;
          p_nama: string;
          p_selesai: boolean;
          p_tidak_ditagih: boolean;
        };
        Returns: string;
      };
      komentar_parts: {
        Args: { p_mentions?: number[]; p_teks: string };
        Returns: Record<string, unknown>;
      };
      lampiran_task_dari_path: { Args: { p_name: string }; Returns: string };
      lempar: {
        Args: { p_hint?: string; p_kode: string; p_pesan: string };
        Returns: undefined;
      };
      lihat_semua: { Args: Record<PropertyKey, never>; Returns: boolean };
      list_diarsip: { Args: Record<PropertyKey, never>; Returns: string[] };
      list_terlihat: { Args: { p_list: string }; Returns: boolean };
      list_tertutup: { Args: Record<PropertyKey, never>; Returns: string[] };
      member_saya: { Args: Record<PropertyKey, never>; Returns: number };
      menunggu_keputusan: { Args: { p_nama: string }; Returns: boolean };
      mode_app: { Args: Record<PropertyKey, never>; Returns: string };
      ms: { Args: { t: string }; Returns: string };
      ms_ke_ts: { Args: { p: number }; Returns: string };
      muat_attachments: { Args: { p_rows: Json }; Returns: Json };
      muat_comment_mentions: { Args: { p_rows: Json }; Returns: Json };
      muat_comments: { Args: { p_rows: Json }; Returns: Json };
      muat_list_statuses: { Args: { p_rows: Json }; Returns: Json };
      muat_members: { Args: { p_rows: Json }; Returns: Json };
      muat_space_anggota: { Args: { p_rows: Json }; Returns: Json };
      muat_struktur: { Args: { p_jenis: string; p_rows: Json }; Returns: Json };
      muat_sync_raw: { Args: { p_rows: Json }; Returns: Json };
      muat_task_assignees: { Args: { p_rows: Json }; Returns: Json };
      muat_tasks: { Args: { p_rows: Json }; Returns: Json };
      muat_workspace: { Args: { p_rows: Json }; Returns: Json };
      mulai_api: {
        Args: { p_aktor: number; p_perlu?: string; p_sumber: string };
        Returns: {
          aktif: boolean;
          auth_user_id: string | null;
          clickup_email: string | null;
          color: string | null;
          created_at: string;
          email: string | null;
          harus_ganti_password: boolean;
          id: number;
          initials: string | null;
          nama: string | null;
          role: string;
          updated_at: string;
          username: string;
        };
        SetofOptions: {
          from: "*";
          to: "members";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      mulai_web: { Args: { p_owner?: boolean }; Returns: number };
      norm_impor_komentar: { Args: { r: Json }; Returns: Json };
      norm_impor_tugas: { Args: { r: Json }; Returns: Json };
      notif_dari_agent: { Args: { p_role: string; p_sumber: string }; Returns: boolean };
      penilai:{ Args: Record<PropertyKey, never>; Returns: number };
      prioritas_dari: { Args: { v: Json }; Returns: number };
      ringkas_tugas: {
        Args: { t: Database["public"]["Tables"]["tasks"]["Row"] };
        Returns: Json;
      };
      riwayat_tugas: { Args: { p_task: string }; Returns: Json };
      rujukan_urai: {
        Args: { p_ref: string };
        Returns: Record<string, unknown>;
      };
      rujukan_wadah: { Args: { p_ref: string }; Returns: Json };
      set_mentions_impor: {
        Args: { p_comment: string; p_ids: number[] };
        Returns: undefined;
      };
      set_space_anggota_impor: {
        Args: { p_members: Json; p_space: string };
        Returns: Json;
      };
      sha256_hex: { Args: { p: string }; Returns: string };
      snapshot_tutup: { Args: { p_task: string }; Returns: Json };
      space_terlihat: { Args: { p_space: string }; Returns: boolean };
      status_cari: {
        Args: { p_list: string; p_status: string };
        Returns: string;
      };
      status_id: {
        Args: { p_clickup_id: string; p_list: string; p_status: string };
        Returns: string;
      };
      status_list_valid: { Args: { p_list: string }; Returns: boolean };
      status_petakan: {
        Args: { p_list: string; p_status: string; p_type: string };
        Returns: string;
      };
      sumber_aktif: { Args: Record<PropertyKey, never>; Returns: string };
      team_id: { Args: Record<PropertyKey, never>; Returns: string };
      tenggat_hitung: {
        Args: { p_folder: string; p_tanggal: string };
        Returns: Json;
      };
      tolak_cermin: { Args: Record<PropertyKey, never>; Returns: undefined };
      ts_dari: { Args: { v: Json }; Returns: string };
      tugas_terlihat: { Args: { p_task: string }; Returns: boolean };
      tugas_tertutup: { Args: Record<PropertyKey, never>; Returns: string[] };
      wajib_owner_aktor: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      wajib_owner_hapus: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      web_admin_anggota_simpan: { Args: { p: Json }; Returns: Json };
      web_admin_kategori: { Args: Record<PropertyKey, never>; Returns: Json };
      web_admin_kategori_simpan: { Args: { p: Json }; Returns: Json };
      web_admin_libur_simpan: { Args: { p: Json }; Returns: Json };
      web_admin_mode: { Args: { p_mode: string }; Returns: Json };
      web_admin_sinkron: { Args: Record<PropertyKey, never>; Returns: Json };
      web_admin_status_simpan: {
        Args: { p_list: string; p_statuses: Json };
        Returns: Json;
      };
      web_admin_struktur_simpan: { Args: { p: Json }; Returns: Json };
      web_admin_token_buat: {
        Args: { p_member: number; p_nama: string; p_scope: string };
        Returns: Json;
      };
      web_admin_token_cabut: { Args: { p_id: string }; Returns: Json };
      web_admin_tokens: { Args: Record<PropertyKey, never>; Returns: Json };
      web_anggota: { Args: Record<PropertyKey, never>; Returns: Json };
      web_arsip: { Args: { p_arsip: boolean; p_task: string }; Returns: Json };
      web_atur_kategori: { Args: { p_kategori: string | null; p_task: string }; Returns: Json };
      web_buat_tugas: { Args: { p_body: Json; p_list: string }; Returns: Json };
      web_cari: { Args: { p_q: string; p_space?: string }; Returns: Json };
      web_daftar: {
        Args: { p_include_closed?: boolean; p_list: string };
        Returns: Json;
      };
      web_detail: { Args: { p_task: string }; Returns: Json };
      web_hapus: { Args: { p_task: string }; Returns: Json };
      web_kategori_kerja: { Args: Record<PropertyKey, never>; Returns: Json };
      web_komentar: {
        Args: {
          p_mentions?: number[];
          p_parent?: string;
          p_task: string;
          p_teks: string;
        };
        Returns: Json;
      };
      web_komentar_edit: {
        Args: { p_comment: string; p_teks: string };
        Returns: Json;
      };
      web_komentar_hapus: { Args: { p_comment: string }; Returns: Json };
      web_lampiran_catat: {
        Args: {
          p_comment: string;
          p_mime: string;
          p_path: string;
          p_size: number;
          p_task: string;
          p_title: string;
        };
        Returns: Json;
      };
      web_lampiran_hapus: { Args: { p_id: string }; Returns: Json };
      web_notif: { Args: { p_dari?: string; p_limit?: number }; Returns: Json };
      web_notif_baca: { Args: { p_dari?: string; p_ids?: number[] }; Returns: Json };
      web_pindah: { Args: { p_list: string; p_task: string }; Returns: Json };
      web_pipeline_akses_daftar: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      web_pipeline_akses_simpan: { Args: { p: Json }; Returns: Json };
      web_pipeline_cek_duplikat: { Args: { p_telepon: string }; Returns: Json };
      web_pipeline_daftar: { Args: { p: Json }; Returns: Json };
      web_pipeline_fu_catat: { Args: { p: Json }; Returns: Json };
      web_pipeline_ganti_sales: { Args: { p: Json }; Returns: Json };
      web_pipeline_kategori: { Args: Record<PropertyKey, never>; Returns: Json };
      web_pipeline_kategori_pindah: { Args: { p: Json }; Returns: Json };
      web_pipeline_kategori_simpan: { Args: { p: Json }; Returns: Json };
      web_pipeline_lead: { Args: { p_id: string }; Returns: Json };
      web_pipeline_lead_buat: { Args: { p: Json }; Returns: Json };
      web_pipeline_lead_ubah: { Args: { p: Json }; Returns: Json };
      web_pipeline_order_ubah: { Args: { p: Json }; Returns: Json };
      web_pipeline_pelanggan: { Args: { p_id: string }; Returns: Json };
      web_pipeline_pelanggan_cari: { Args: { p_q: string }; Returns: Json };
      web_pipeline_pelanggan_daftar: { Args: { p: Json }; Returns: Json };
      web_pipeline_pelanggan_dobel: { Args: Record<PropertyKey, never>; Returns: Json };
      web_pipeline_pelanggan_dobel_abaikan: { Args: { p: Json }; Returns: Json };
      web_pipeline_pelanggan_gabung: { Args: { p: Json }; Returns: Json };
      web_pipeline_pelanggan_gabung_batal: { Args: { p: Json }; Returns: Json };
      web_pipeline_pelanggan_ubah: { Args: { p: Json }; Returns: Json };
      web_pipeline_ringkas: { Args: { p: Json }; Returns: Json };
      web_pipeline_saya: { Args: Record<PropertyKey, never>; Returns: Json };
      web_pipeline_sales: { Args: Record<PropertyKey, never>; Returns: Json };
      web_pipeline_tahap: { Args: { p: Json }; Returns: Json };
      web_pulihkan: { Args: { p_task: string }; Returns: Json };
      web_purge: { Args: { p_task: string }; Returns: Json };
      web_saya: { Args: Record<PropertyKey, never>; Returns: Json };
      web_struktur: { Args: Record<PropertyKey, never>; Returns: Json };
      web_sudah_ganti_password: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      web_tenggat: { Args: { p_tanggal?: string }; Returns: Json };
      web_tugas_kategori: { Args: { p_kategori?: string | null; p_selesai?: boolean }; Returns: Json };
      web_tugas_saya: { Args: { p_member?: number }; Returns: Json };
      web_ubah_tugas: {
        Args: { p_body: Json; p_task: string; p_versi: number };
        Returns: Json;
      };
      web_urut: {
        Args: { p_orderindex?: number; p_status?: string; p_task: string };
        Returns: Json;
      };
      wib_date: { Args: { t: string }; Returns: string };
      x_activity: { Args: { p_aktor: number; p_task: string }; Returns: Json };
      x_admin_akun: {
        Args: {
          p_aktor: number;
          p_auth_user: string;
          p_email: string;
          p_harus_ganti?: boolean;
          p_member: number;
        };
        Returns: Json;
      };
      x_export: { Args: { p_aktor: number }; Returns: Json };
      x_resolve: { Args: { p_aktor: number; p_ref: string }; Returns: Json };
      x_search: {
        Args: {
          p_aktor: number;
          p_include_closed?: boolean;
          p_q: string;
          p_space?: string;
        };
        Returns: Json;
      };
      x_sensus: { Args: { p_aktor: number; p_sumber?: string }; Returns: Json };
      x_tenggat: {
        Args: { p_aktor: number; p_folder?: string; p_tanggal?: string };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;

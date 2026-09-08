# Creator Connect

Act as a Principal Full-Stack Engineer and System Architect. Build a production-ready, fully functional 2-sided marketplace web platform: "Micro-Influencer Ad Exchange Platform" (Middleman Model between Brands and Creators).

### Tech Stack:

- Framework: Next.js 14/15 (App Router, TypeScript)

- UI/Styling: Tailwind CSS, Shadcn UI components, Lucide-react icons

- Backend & Database: Supabase (PostgreSQL, Auth, Storage, Row-Level Security)

- State & Forms: React Hook Form, Zod validation, TanStack Query

---

### 1. Database Schema (Supabase SQL)

Generate a complete PostgreSQL script with tables, foreign keys, enums, and RLS policies:

1. `profiles`:

   - `id` (references auth.users.id, Primary Key)

   - `role` (enum: 'brand', 'creator', 'admin')

   - `full_name`, `email`, `phone`, `avatar_url`, `created_at`

2. `creator_profiles`:

   - `id` (Primary Key), `user_id` (references profiles.id)

   - `instagram_handle`, `niche` (e.g., Fitness, Tech, Education, Food, Lifestyle)

   - `follower_count` (int), `avg_views` (int), `engagement_rate` (float)

   - `city`, `state`, `min_rate_per_post` (numeric), `is_verified` (boolean, default false)

3. `campaigns`:

   - `id` (Primary Key), `brand_id` (references profiles.id)

   - `title`, `description`, `niche_requirement`, `target_city`

   - `total_budget` (numeric), `payout_per_creator` (numeric), `max_creators_needed` (int)

   - `guidelines` (text), `status` (enum: 'draft', 'active', 'in_progress', 'completed')

   - `created_at`

4. `campaign_applications`:

   - `id` (Primary Key), `campaign_id` (references campaigns.id)

   - `creator_id` (references creator_profiles.id)

   - `status` (enum: 'applied', 'approved', 'rejected', 'submitted', 'paid')

   - `submission_link` (text, Instagram post/reel URL)

   - `proof_screenshot_url` (text), `applied_at`, `submitted_at`

---

### 2. User Roles & Workflows

#### A. Creator Workflow:

1. Multi-step onboarding form: Fill Instagram handle, city, niche, follower bracket, and minimum expected payout.

2. Creator Dashboard:

   - Browse active campaigns matching their niche/city.

   - One-click "Apply to Campaign".

   - "My Deliverables" tab: Input live Instagram Reel/Post URL and upload proof screenshot once approved.

   - Payout status tracker (Pending Review -> Approved -> Paid).

#### B. Brand Workflow:

1. Campaign Creator Wizard:

   - Form with Zod validation to define Budget, Niche, City, and Number of Creators.

   - Summary card showing estimated reach calculation ($creators \times avg\_views$).

2. Brand Campaign Management Hub:

   - View applied creators with mini-profile cards (Handle, City, Followers, Engagement).

   - "Approve" or "Reject" buttons for applicants.

   - Submissions Review Tab: Direct embed/link of submitted Reel URLs + single-click "Verify & Release Payment".

#### C. Admin Dashboard (`/admin`):

- High-level metrics: Total campaigns, Gross platform volume (₹), Active creators.

- Quick approval toggle for creator profiles and manual payout mark.

---

### 3. Key Pages & Routes (Next.js App Router)

Create fully styled, responsive pages:

- `/` (High-converting Landing Page explaining the middleman model for both Brands & Creators)

- `/auth/login` and `/auth/register` (Tabbed UI for Brand vs Creator signup)

- `/dashboard/creator` (Campaign explorer + active assignments)

- `/dashboard/brand` (Create campaign + applicant management + campaign performance)

- `/dashboard/brand/campaigns/[id]` (Detailed campaign tracking and creator submission verification)

---

### 4. API Endpoints (Next.js Route Handlers)

1. `POST /api/campaigns/create`: Authenticated endpoint with server-side validation.

2. `POST /api/applications/submit-proof`: Submits the reel URL and triggers simulated validation (checks valid instagram.com URL structure).

3. `PATCH /api/applications/status`: Handles approving, rejecting, or marking payment complete.

---

### 5. Design & UI Specifications

- Modern, clean SaaS aesthetic (Dark/Light neutral background with Indigo/Violet primary accents).

- Informative status badges (`Applied`, `In Progress`, `Under Review`, `Paid`).

- Empty states with call-to-actions when no campaigns or applications exist.

- Fully typed TypeScript code throughout. Include error handling, loading spinners, and toast notifications (Sonner). No placeholder/mock files—provide complete implementation code.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a44df52f-7bc8-488d-add6-cc892f3f6938).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
